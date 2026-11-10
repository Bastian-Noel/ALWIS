"""Source-only guardrails for the independent ALWIS PHP 8.4 SAPI candidate.

These tests NEVER imply that PHP/MariaDB WebAssembly was linked or executed.
"""
import hashlib
import json
import os
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
                            str(root / 'joomengine-not-present'), str(php.parents[1]),
                            str(output), '--independent-runner'],
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

    def test_new_runner_is_explicitly_opt_in(self):
        build = (ROOT / 'engine/native/build/runtime-target.cmake').read_text()
        independent = (ROOT / 'scripts/build-independent-native.sh').read_text()
        script = (ROOT / 'engine/native/build/build.sh').read_text()
        self.assertIn('if(PBL_INDEPENDENT_PHP_RUNNER)', build)
        self.assertIn('PBL_INDEPENDENT_PHP_RUNNER=ON', independent)
        self.assertIn('PBL_INDEPENDENT_PHP_RUNNER:-OFF', script)
        self.assertIn('request-state.c', build)


if __name__ == '__main__':
    unittest.main()
