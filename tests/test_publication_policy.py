import copy
import json
from pathlib import Path
import sys
import unittest
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from publication_policy import require_publication

class PublicationPolicyTests(unittest.TestCase):
    def setUp(self):
        self.record = json.loads((ROOT / "provenance/release-licensing-status.json").read_text())
    def test_owner_exception_allows_only_recorded_release(self):
        require_publication(self.record, ROOT, "2026.11.0-beta.1")
        with self.assertRaisesRegex(ValueError, "version"):
            require_publication(self.record, ROOT, "2026.11.0-beta.2")
    def test_unknown_blocker_is_not_silently_ignored(self):
        self.record["blockers"].append({"id": "new-incompatible-dependency"})
        with self.assertRaises(ValueError): require_publication(self.record, ROOT)
    def test_exception_cannot_expand_to_other_files(self):
        self.record["publicationException"]["files"].append("Zend/zend_alloc.c")
        with self.assertRaises(ValueError): require_publication(self.record, ROOT)
    def test_notice_tampering_and_missing_authorization_fail(self):
        for field, value in [("noticeSha256", "0" * 64), ("maintainerAuthorized", False)]:
            record = copy.deepcopy(self.record)
            record["publicationException"][field] = value
            with self.assertRaises(ValueError): require_publication(record, ROOT)
    def test_legacy_blocked_record_without_exception_stays_blocked(self):
        self.record["status"] = "blocked"
        with self.assertRaises(ValueError): require_publication(self.record, ROOT)

if __name__ == "__main__": unittest.main()
