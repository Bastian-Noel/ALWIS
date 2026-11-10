import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import hashlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_qa_artifact as stage
import restore_independent_native_qa as restore


class QARestoreTests(unittest.TestCase):
    def setUp(self):
        t = tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        self.root = Path(t.name)
        self.bundle = self.root / "qa"
        (self.bundle / "runtime").mkdir(parents=True)
        files = {
            "runtime/pbl-runtime.wasm": b"fresh independent wasm",
            "runtime/pbl-runtime.mjs": b"wasm compiled JS",
            "corresponding-sources.tar.gz": b"7 sources archive",
            "corresponding-sources.tar.gz.json": json.dumps({
                "archives": [{"repo": f"src/{i}"} for i in range(7)],
                "historicalJoomEngineForkIncluded": False
            }).encode(),
            "native-license-evidence.json": json.dumps({
                "blocked": True, "releaseApproved": False
            }).encode(),
        }
        for name, content in files.items():
            (self.bundle / name).write_bytes(content)
        def checksum(name):
            return hashlib.sha256(files[name]).hexdigest()
        self.manifest = {
            "status": "independent-native-qa-only", "releaseApproved": False,
            "sourceRevision": "b" * 40,
            "wasmSha256": checksum("runtime/pbl-runtime.wasm"),
            "glueSha256": checksum("runtime/pbl-runtime.mjs"),
            "sourcesSha256": checksum("corresponding-sources.tar.gz"),
            "sourceReceiptSha256": checksum("corresponding-sources.tar.gz.json"),
            "licensingEvidenceSha256": checksum("native-license-evidence.json"),
            "nativeInputs": stage.locked_inputs(),
            "parity": [{"browser": x, "cases": 17} for x in ("chromium","firefox")]
        }
        (self.bundle / "qa-manifest.json").write_text(json.dumps(self.manifest))
        (self.bundle / "independent-native-build.json").write_text(json.dumps({
            "status": "browser-parity-verified", "browserValidated": True,
            "releaseApproved": False, "wasmSha256": self.manifest["wasmSha256"]
        }))
        self.lock = {key: self.manifest[key] for key in
            ("sourceRevision", "wasmSha256","glueSha256","sourcesSha256")}

    def test_only_source_pinned_new_wasm_is_accepted(self):
        self.assertEqual(
            restore.ensure_candidate(self.bundle, self.lock)["wasmSha256"],
            self.manifest["wasmSha256"])

    def test_mismatched_wasm_refused(self):
        (self.bundle / "runtime/pbl-runtime.wasm").write_bytes(b"historical spoof")
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            restore.ensure_candidate(self.bundle, self.lock)

    def test_source_modified_since_build_is_refused(self):
        with patch.object(restore, "locked_inputs", return_value={"different.c": "f" * 64}):
            with self.assertRaisesRegex(ValueError, "changed since QA build"):
                restore.ensure_candidate(self.bundle, self.lock)

    def test_missing_original_source_bundle_refused(self):
        (self.bundle / "corresponding-sources.tar.gz").unlink()
        with self.assertRaisesRegex(ValueError, "missing"):
            restore.ensure_candidate(self.bundle, self.lock)

    def test_preclaimed_legal_approval_is_refused(self):
        self.manifest["releaseApproved"] = True
        (self.bundle / "qa-manifest.json").write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError, "non-QA"):
            restore.ensure_candidate(self.bundle, self.lock)


if __name__ == "__main__":
    unittest.main()
