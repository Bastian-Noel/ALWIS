"""Source-only guardrails for the independent ALWIS PHP 8.4 SAPI candidate.

These tests NEVER imply that PHP/MariaDB WebAssembly was linked or executed.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / 'packages/php-native/src/runner.c'
STATE = ROOT / 'packages/php-native/src/request-state.c'
STATE_HEADER = ROOT / 'packages/php-native/src/request-state.h'
C_TEST = ROOT / 'tests/native/request-state.c'
GENERATOR = ROOT / 'scripts/prepare-native-drivers.py'


class IndependentRunnerTests(unittest.TestCase):
    def test_portable_request_lifecycle_compiles_and_runs(self):
        compiler = shutil.which('cc')
        self.assertIsNotNone(compiler, 'Native source contract requires a C compiler')
        with tempfile.TemporaryDirectory() as temp:
            binary = Path(temp) / 'request-state-test'
            subprocess.run([compiler, '-std=c11', '-D_POSIX_C_SOURCE=200809L', '-O2',
                            '-Wall', '-Wextra', '-Werror',
                            '-I' + str(STATE_HEADER.parent),
                            str(STATE), str(C_TEST), '-o', str(binary)],
                           check=True, capture_output=True, text=True, timeout=45)
            result = subprocess.run([str(binary)], check=True,
                                    capture_output=True, text=True, timeout=10)
            self.assertIn('passed', result.stdout)

    def test_emscripten_missing_fd_limit_function_has_checked_portability_adapter(self):
        compiler = shutil.which('cc')
        self.assertIsNotNone(compiler)
        source = ROOT / 'packages/php-native/src/portability.c'
        link = (ROOT / 'engine/native/build/runtime-target.cmake').read_text()
        self.assertIn('packages/php-native/src/portability.c', link)
        self.assertIn('getdtablesize', source.read_text())
        with tempfile.TemporaryDirectory() as temp:
            exe = Path(temp) / 'portability-test'
            subprocess.run([compiler, '-std=c11', '-D__EMSCRIPTEN__',
                            '-D_DEFAULT_SOURCE', '-Wall', '-Wextra', '-Werror',
                            str(source), str(ROOT / 'tests/native/portability.c'),
                            '-o', str(exe)], check=True, capture_output=True, text=True)
            result = subprocess.run([str(exe)], capture_output=True,
                                    check=True, text=True, timeout=10)
            self.assertIn('portability passed', result.stdout)

    def test_candidate_generator_does_not_depend_on_deleted_joomengine_runner(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            php = root / 'php-source/ext/pdo_mysql'
            php.mkdir(parents=True)
            (php / 'mysql_driver.c').write_text('''#include "php.h"\nH = pecalloc(1, sizeof(pdo_mysql_db_handle), dbh->is_persistent);\nif (!(H->server = pdo_mysql_init(dbh->is_persistent))) {\n\t\tpdo_mysql_error(dbh);\n''')
            (php / 'mysql_statement.c').write_text('''#include "php.h"\n#if MYSQL_VERSION_ID >= 50708 || defined(PDO_USE_MYSQLND)\nZVAL_STRINGL_FAST(result, S->bound_result[colno].buffer, length);\nZVAL_STRINGL_FAST(result, S->current_data[colno], S->current_lengths[colno]);\n''')
            (php / 'php_pdo_mysql_int.h').write_text('''zend_ulong\t\t\t*in_length;\nzend_ulong\t\t\t\t*out_length;\n''')
            output = root / 'output'
            subprocess.run([sys.executable, str(GENERATOR),
                            str(php.parents[1]), str(output)],
                           check=True, capture_output=True, text=True, timeout=15)
            self.assertEqual(hashlib.sha256((output / 'runtime.c').read_bytes()).hexdigest(),
                             hashlib.sha256(RUNNER.read_bytes()).hexdigest())
            receipt = json.loads((output / 'driver-adapter.json').read_text())
            native = next(item for item in receipt if item['generated'] == 'runtime.c')
            self.assertEqual(native['originalSha256'], native['generatedSha256'])
            self.assertEqual(native['source'], str(RUNNER))
            self.assertIn('pbl_mysql_owner', RUNNER.read_text())
            self.assertIn('php_request_shutdown', RUNNER.read_text())
            self.assertIn('php_execute_script', RUNNER.read_text())

    def test_historical_wrapper_is_not_silently_substituted(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            result = subprocess.run([sys.executable, str(GENERATOR),
                                     str(root / 'historical-missing'), str(root / 'php'),
                                     str(root / 'generated')],
                                    capture_output=True, text=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / 'generated/runtime.c').exists())

    def test_release_audit_distinguishes_source_from_compiled_native(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('native_audit', ROOT / 'scripts/audit-native-inputs.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        report = module.audit()
        candidate = report['candidateRunner']
        self.assertEqual(candidate['sourceSha256'], hashlib.sha256(RUNNER.read_bytes()).hexdigest())
        self.assertTrue(candidate['sourcePresent'])
        self.assertTrue(candidate['independentRunnerIsDefault'])
        self.assertTrue(report['preflight']['phpRunnerSourcePresent'])
        self.assertFalse(candidate['compiledWithCandidate'])
        self.assertFalse(candidate['nativeBrowserParity'])
        self.assertFalse(report['preflight']['newRuntimeBrowserValidated'])

    def test_strict_corresponding_sources_require_our_exact_runner(self):
        sys.path.insert(0, str(ROOT / 'scripts'))
        from native_runner_provenance import verify
        with tempfile.TemporaryDirectory() as temp:
            generated = Path(temp)
            src = generated / 'runtime.c'
            src.write_bytes(RUNNER.read_bytes())
            checksum = hashlib.sha256(RUNNER.read_bytes()).hexdigest()
            record = [{
                'source': str(RUNNER), 'generated': 'runtime.c',
                'originalSha256': checksum, 'generatedSha256': checksum,
            }]
            (generated / 'driver-adapter.json').write_text(json.dumps(record))
            receipt = verify(ROOT, generated)
            self.assertEqual(receipt['sourceSha256'], checksum)
            self.assertEqual(len(receipt['generatedFiles']), 2)
            src.write_bytes(src.read_bytes() + b'\n// changed generated SAPI')
            with self.assertRaisesRegex(ValueError, 'does not exactly match'):
                verify(ROOT, generated)
            src.write_bytes(RUNNER.read_bytes())
            record[0]['source'] = str(ROOT / 'build-work/php/native/runtime.c')
            (generated / 'driver-adapter.json').write_text(json.dumps(record))
            with self.assertRaisesRegex(ValueError, 'does not exactly match'):
                verify(ROOT, generated)

    def test_release_source_list_excludes_unlinked_joomengine(self):
        sys.path.insert(0, str(ROOT / 'scripts'))
        from importlib import import_module
        sources = import_module('package-native-sources')
        archives = sources.expected_archives()
        repos = {row['repo'] for row in archives}
        self.assertEqual(len(repos), 7)
        self.assertNotIn('joomengine/php-wasm', repos)
        self.assertIn('seanmorris/php-wasm', repos)
        self.assertIn('php/php-src', repos)
        self.assertIn('php/php-release', repos)
        self.assertIn('PCRE2Project/pcre2', repos)
        self.assertIn('shyim/lite4mariadb', repos)
        self.assertTrue(any(row['repo'] == 'MariaDB/mariadb-connector-c' for row in archives))
        self.assertTrue(any(row['repo'] == 'wolfSSL/wolfssl' for row in archives))
        self.assertTrue(any(path.name == 'native_runner_provenance.py' for path in sources.source_files()))

    def test_release_manifest_tracks_independent_runner_without_legacy_archive(self):
        code = (ROOT / 'scripts/manifest-native-build.py').read_text()
        workflow = (ROOT / '.github/workflows/native-distribution.yml').read_text()
        self.assertIn("'historicalJoomEngineForkIncluded':False", code)
        self.assertIn("'independentPhpRunner':runner_provenance", code)
        self.assertIn("runner==bundle.get('independentPhpRunner')", workflow)
        self.assertIn('Legacy fork', workflow)
        self.assertIn("'phpFiberAdapter':fibers_receipt", code)
        self.assertIn("bundle.get('phpFiberAdapter',{})", workflow)

    def test_new_runner_is_the_only_build_path(self):
        build = (ROOT / 'engine/native/build/runtime-target.cmake').read_text()
        independent = (ROOT / 'scripts/build-independent-native.sh').read_text()
        script = (ROOT / 'engine/native/build/build.sh').read_text()
        generator = GENERATOR.read_text()
        self.assertNotIn('PBL_INDEPENDENT_PHP_RUNNER', build + independent + script)
        self.assertNotIn('php_wrapper', generator)
        self.assertNotIn('native/runtime.c', generator)
        self.assertIn('request-state.c', build)
        self.assertIn('PBL_TARGET:-pbl-runtime', script)
        self.assertIn('packages/php-native/src/runner.c', generator)


if __name__ == '__main__':
    unittest.main()
