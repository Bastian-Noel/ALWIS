import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import hashlib
import shutil
import subprocess

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

    def _mock_verified_workflow(self, *, source_match=True, tamper=False,
                                run_success=True, artifact_present=True):
        """Authenticated GitHub API responses and a local synthetic QA bundle."""
        sha = self.manifest["sourceRevision"]
        run = {"databaseId": 123, "status": "completed" if run_success else "in_progress",
               "conclusion": "success" if run_success else "", "headSha": sha}
        def output(cmd, *args, **kwargs):
            if cmd[:3] == ["gh", "run", "list"]:
                return json.dumps([run])
            if cmd[:2] == ["gh", "api"]:
                return json.dumps({"artifacts": [
                    {"name": "independent-native-qa-with-sources",
                     "expired": False}] if artifact_present else []})
            if cmd[:3] == ["gh", "run", "view"]:
                return json.dumps({
                    "status": "completed", "conclusion": "success",
                    "workflowName": "CI - independent PHP MariaDB native reconstruction",
                    "headSha": sha,
                    "headBranch": "develop/2026-11-beta1-foundation",
                })
            raise AssertionError(f"Unexpected authenticated API operation: {cmd}")
        def download(cmd, *args, **kwargs):
            self.assertEqual(cmd[:3], ["gh", "run", "download"])
            shutil.copytree(self.bundle, cmd[cmd.index("--dir") + 1], dirs_exist_ok=True)
            if tamper:
                Path(cmd[cmd.index("--dir") + 1], "runtime/pbl-runtime.wasm").write_bytes(b"spoof")
            return subprocess.CompletedProcess(cmd, 0)
        input_hashes = stage.locked_inputs()
        if not source_match:
            input_hashes = {"different-owner-source.c": "x" * 64}
        return (patch.object(restore.subprocess, "check_output", side_effect=output),
                patch.object(restore.subprocess, "run", side_effect=download),
                patch.object(restore, "locked_inputs", return_value=input_hashes))

    def test_first_validated_qa_build_is_automatically_selected_without_config(self):
        a, b, c = self._mock_verified_workflow()
        with a, b, c:
            candidate, lock, proof = next(restore.find_verified_compatible_candidate())
            self.assertEqual(lock["runId"], 123)
            self.assertEqual(proof["wasmSha256"], self.manifest["wasmSha256"])
            self.assertEqual(lock["sourceRevision"], "b" * 40)

    def test_auto_discovery_never_uses_incompatible_source(self):
        a, b, c = self._mock_verified_workflow(source_match=False)
        with a, b, c:
            with self.assertRaisesRegex(ValueError, "SAME verified C/JS native inputs"):
                list(restore.find_verified_compatible_candidate())

    def test_auto_discovery_rejects_tampered_binary_even_if_ci_was_green(self):
        a, b, c = self._mock_verified_workflow(tamper=True)
        with a, b, c:
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                list(restore.find_verified_compatible_candidate())

    def test_no_successful_build_never_falls_back_to_historical_release(self):
        a, b, c = self._mock_verified_workflow(run_success=False)
        with a, b, c:
            with self.assertRaisesRegex(ValueError, "No successful native CI build"):
                list(restore.find_verified_compatible_candidate())

    def test_missing_source_bundle_is_not_silently_replaced(self):
        a, b, c = self._mock_verified_workflow(artifact_present=False)
        with a, b, c:
            with self.assertRaisesRegex(ValueError, "No successful native CI artifact"):
                list(restore.find_verified_compatible_candidate())

    def test_wait_for_newly_completed_native_run_only_on_transient_absence(self):
        fallback = (self.bundle, self.lock, self.manifest)
        with patch.object(restore, "find_verified_compatible_candidate",
                          side_effect=[ValueError("No successful native CI build exists"),
                                       iter([fallback])]) as scan, \
             patch.object(restore.time, "sleep") as sleep:
            found = next(restore.wait_for_verified_candidate(30))
            self.assertEqual(found[2]["wasmSha256"], self.manifest["wasmSha256"])
            self.assertEqual(scan.call_count, 2)
            sleep.assert_called_once()

    def test_wait_never_retries_invalid_candidate(self):
        with patch.object(restore, "find_verified_compatible_candidate",
                          side_effect=ValueError("QA payload missing or hash mismatch")), \
             patch.object(restore.time, "sleep") as sleep:
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                next(restore.wait_for_verified_candidate(180))
            sleep.assert_not_called()

    def test_preclaimed_legal_approval_is_refused(self):
        self.manifest["releaseApproved"] = True
        (self.bundle / "qa-manifest.json").write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError, "non-QA"):
            restore.ensure_candidate(self.bundle, self.lock)


if __name__ == "__main__":
    unittest.main()
