"""No-network tests for strict verification of the historical runtime witness."""
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/restore-deployment-engine.py"
spec = importlib.util.spec_from_file_location("restore_deployment_engine", SCRIPT)
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)


def fixture_manifest(mjs=b"native-js", wasm=b"native-wasm"):
    return {"files": {
        "pbl-runtime.mjs": {"bytes": len(mjs), "sha256": restore.checksum(mjs)},
        "pbl-runtime.wasm": {"bytes": len(wasm), "sha256": restore.checksum(wasm)},
    }}


class NativeWitnessRestoreTests(unittest.TestCase):
    def test_recovered_witness_manifest_is_exactly_pinned(self):
        lock = json.loads((ROOT / "config/native-runtime.json").read_text())
        data, manifest = restore.pinned_manifest(lock)
        self.assertEqual(restore.checksum(data), lock["manifestSha256"])
        self.assertEqual(manifest["sourceRevision"], "bed7ca0ab47e155bf3ad9556c5abe4933f93e896")
        self.assertNotIn("licensing", manifest)

    def test_exact_zip_members_are_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "witness.zip"
            with zipfile.ZipFile(path, "w") as z:
                z.writestr("fixed/pbl-runtime.mjs", b"native-js")
                z.writestr("fixed/pbl-runtime.wasm", b"native-wasm")
            recovered = restore.verify_preview_archive(
                path, fixture_manifest(), restore.checksum(path.read_bytes()), "fixed/"
            )
            self.assertEqual(recovered["pbl-runtime.wasm"], b"native-wasm")

    def test_zip_hash_mismatch_is_not_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "witness.zip"
            with zipfile.ZipFile(path, "w") as z:
                z.writestr("fixed/pbl-runtime.mjs", b"native-js")
                z.writestr("fixed/pbl-runtime.wasm", b"native-wasm")
            with self.assertRaisesRegex(ValueError, "ZIP SHA-256 mismatch"):
                restore.verify_preview_archive(path, fixture_manifest(), "0" * 64, "fixed/")

    def test_member_hash_mismatch_is_not_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "witness.zip"
            with zipfile.ZipFile(path, "w") as z:
                z.writestr("fixed/pbl-runtime.mjs", b"native-js")
                z.writestr("fixed/pbl-runtime.wasm", b"wrong-binary")
            with self.assertRaisesRegex(ValueError, "native byte mismatch"):
                restore.verify_preview_archive(
                    path, fixture_manifest(), restore.checksum(path.read_bytes()), "fixed/"
                )

    def test_zip_cannot_select_unexpected_member(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "witness.zip"
            with zipfile.ZipFile(path, "w") as z:
                z.writestr("other/pbl-runtime.mjs", b"native-js")
                z.writestr("other/pbl-runtime.wasm", b"native-wasm")
            with self.assertRaises(KeyError):
                restore.verify_preview_archive(
                    path, fixture_manifest(), restore.checksum(path.read_bytes()), "fixed/"
                )

    def test_rejects_unsafe_source_paths_before_git_read(self):
        with self.assertRaisesRegex(ValueError, "Unsafe native source path"):
            restore.verify_sources(
                {"sourceRevision": "0" * 40, "sourceFiles": [{"path": "../secrets", "sha256": "0" * 64}]},
                {"sourceRelocations": {}},
            )


if __name__ == "__main__":
    unittest.main()
