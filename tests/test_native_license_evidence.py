import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "native_license_evidence", ROOT / "scripts/audit-native-license-evidence.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class NativeLicenseEvidenceTests(unittest.TestCase):
    def test_exactly_seven_source_archives_with_pins(self):
        rows = audit.archives()
        self.assertEqual(len(rows), 7)
        self.assertEqual({row["repo"] for row in rows}, audit.EXPECTED_REPOS)
        self.assertTrue(all(len(row["expectedSha256"]) == 64 for row in rows))

    def test_evidence_inventory_is_never_a_legal_clearance(self):
        report = audit.check(strict_archives=False)
        self.assertTrue(report["blocked"])
        self.assertFalse(report["releaseApproved"])
        self.assertFalse(report["legalReviewComplete"])
        self.assertEqual(len(report["openPublicationBlockers"]), 5)
        self.assertIn("phpLicense3To4", report["claimsChecked"])
        self.assertIn("zendLicense2To3", report["claimsChecked"])

    def test_c_link_inputs_are_pinned_and_missing_spdx_is_reported(self):
        inputs = audit.build_inputs()
        names = [row["path"] for row in inputs]
        self.assertIn("packages/php-native/src/runner.c", names)
        self.assertIn("packages/sql-native/src/pbl_mysql.c", names)
        self.assertFalse(any("joomengine" in name.lower() for name in names))
        self.assertTrue(all(row["spdx"] == "GPL-2.0-only" for row in inputs))
        self.assertTrue(all(row["sha256"] == audit.sha(ROOT / row["path"]) for row in inputs))

    def test_tampered_legacy_license_source_must_fail(self):
        original = audit.sha
        def changed(path):
            if path.name == "Zend-Engine-original-2.00.txt":
                return "0" * 64
            return original(path)
        with patch.object(audit, "sha", side_effect=changed):
            with self.assertRaisesRegex(ValueError, "Original PHP or Zend license copy altered"):
                audit.check(strict_archives=False)

    def test_wolfssl_and_php_zend_texts_not_truncated(self):
        report = audit.check(strict_archives=False)
        for record in report["originalLicenseEvidence"]:
            self.assertEqual(len(record["sha256"]), 64)
            self.assertTrue((ROOT / record["path"]).stat().st_size > 500)


if __name__ == "__main__":
    unittest.main()
