"""Fail-closed tests for attesting a newly compiled WASM to browser receipts."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('independent_attestation',
    ROOT / 'scripts/attest-independent-parity.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class AttestationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.runtime = self.root / "runtime"
        self.parity = self.root / "parity"
        self.runtime.mkdir()
        self.parity.mkdir()
        self.wasm = self.runtime / "pbl-runtime.wasm"
        self.js = self.runtime / "pbl-runtime.mjs"
        self.wasm.write_bytes(b"fresh independent native WebAssembly test fixture")
        self.js.write_bytes(b"independent JS integration")
        self.wasm_sha = hashlib.sha256(self.wasm.read_bytes()).hexdigest()
        self.js_sha = hashlib.sha256(self.js.read_bytes()).hexdigest()
        self.receipt = self.root / "independent-native-build.json"
        self.receipt.write_text(json.dumps({"status": "compiled-candidate",
            "wasmSha256": self.wasm_sha, "bytes": self.wasm.stat().st_size,
            "browserValidated": False, "releaseApproved": False}))
        self.tests = []
        for browser in ('chromium', 'firefox'):
            rows = [{"case": case, "step": step, "status": 500 if case == "error" else 200,
                     "exitCode": 255 if case == "error" else 0}
                    for case, step in mod.EXPECTED]
            self.tests.append(self.parity / f"independent-candidate-{browser}.json")
            self.tests[-1].write_text(json.dumps({
                "schemaVersion": 1, "passed": True, "browser": browser,
                "label": "independent-candidate", "browserVersion": "1.0",
                "wasmSha256": self.wasm_sha, "nativeJsSha256": self.js_sha,
                "wasmBytes": self.wasm.stat().st_size,
                "cases": rows, "state": {"sqlConnections": 0, "nativeStatements": 0}
            }))

    def test_both_browsers_attest_same_compiled_binary_without_release(self):
        result = mod.attest(self.receipt, self.parity, self.runtime)
        self.assertTrue(result['browserValidated'])
        self.assertEqual(result['status'], 'browser-parity-verified')
        self.assertEqual(len(result['parity']), 2)
        self.assertEqual(len(mod.EXPECTED), 17)
        self.assertFalse(result['releaseApproved'])

    def test_missing_firefox_or_incomplete_cases_never_promotes(self):
        self.tests[1].unlink()
        with self.assertRaises(FileNotFoundError):
            mod.attest(self.receipt, self.parity, self.runtime)
        self.assertFalse(json.loads(self.receipt.read_text())['browserValidated'])
        data = json.loads(self.tests[0].read_text())
        data['cases'].pop()
        self.tests[0].write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            mod.attest(self.receipt, self.parity, self.runtime)

    def test_wrong_sha_or_old_legacy_hash_never_promotes(self):
        data = json.loads(self.tests[0].read_text())
        data['nativeJsSha256'] = '0' * 64
        self.tests[0].write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'stale'):
            mod.attest(self.receipt, self.parity, self.runtime)
        self.assertFalse(json.loads(self.receipt.read_text())['browserValidated'])

    def test_failed_probe_and_leaked_sql_never_promote(self):
        for key, value in (('passed', False), ('state', {'sqlConnections': 1, 'nativeStatements': 0})):
            data = json.loads(self.tests[0].read_text())
            data[key] = value
            self.tests[0].write_text(json.dumps(data))
            with self.assertRaises(ValueError):
                mod.attest(self.receipt, self.parity, self.runtime)
            self.assertFalse(json.loads(self.receipt.read_text())['browserValidated'])


if __name__ == '__main__':
    unittest.main()
