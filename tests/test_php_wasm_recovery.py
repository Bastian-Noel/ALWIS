import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/recover-php-wasm-source.py"
spec = importlib.util.spec_from_file_location("recover_php_wasm_source", SCRIPT)
recover = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recover)


class PHPWasmSourceRecoveryTests(unittest.TestCase):
    def test_incorrect_archive_is_not_accepted_as_exact_backup(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / recover.LEGACY_NAME
            path.write_bytes(b"unrelated archive")
            scanned, candidates, found = recover.inspect_candidates([Path(d)])
            self.assertIn(recover.public_path(Path(d)), scanned)
            self.assertEqual(found, None)
            self.assertEqual(candidates[0]["sha256"], recover.checksum(path))
            self.assertFalse(candidates[0]["exact"])

    def test_detects_possible_runner_in_zip_without_claiming_recovery(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "alwis-backup.zip"
            with zipfile.ZipFile(path, "w") as z:
                z.writestr("source/native/runtime.c", "int synthetic(void) {return 0;}")
            _scanned, candidates, found = recover.inspect_candidates([Path(d)])
            self.assertIsNone(found)
            self.assertEqual(candidates[0]["kind"], "possible-source-inside-zip")
            self.assertEqual(candidates[0]["members"], ["source/native/runtime.c"])

    def test_fallback_manifest_declares_abi_incompatibility(self):
        # The manifest contract is testable in a clean clone. A full recovery
        # audit still MUST reject a missing or mismatched upstream archive.
        fallback = recover.fallback_manifest()
        self.assertFalse(fallback["dropInCompatible"])
        self.assertIn("php_wasm_run", fallback["alwisRequiredAPI"])
        self.assertIn("pib_run", fallback["originalAPI"])
        with tempfile.TemporaryDirectory() as d:
            original_root = recover.ROOT
            try:
                recover.ROOT = Path(d)
                with self.assertRaises(SystemExit):
                    recover.audit([Path(d)])
            finally:
                recover.ROOT = original_root


if __name__ == "__main__":
    unittest.main()
