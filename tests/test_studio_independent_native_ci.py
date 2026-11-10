"""The Studio validation pipeline must never package the historical WASM."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class StudioIndependentNativeCITests(unittest.TestCase):
    def test_studio_action_requires_new_attested_native_without_legacy_fallback(self):
        source = (ROOT / '.github/actions/validated-studio/action.yml').read_text()
        self.assertIn('python3 scripts/restore_independent_native_qa.py', source)
        self.assertNotIn('python3 scripts/restore-deployment-engine.py', source)
        self.assertIn('ALWIS_PARITY_LABEL=independent-studio', source)
        self.assertIn('node tests/browser/collab-native-php-peers.mjs', source)
        self.assertIn('node tests/browser/native-curl.mjs', source)

    def test_fresh_first_build_does_not_require_missing_json_pin(self):
        source = (ROOT / "scripts/restore_independent_native_qa.py").read_text()
        self.assertIn("if args.config.is_file()", source)
        self.assertIn("find_verified_compatible_candidate()", source)
        self.assertIn("build-work/independent-native-qa-selection.json", source)
        self.assertIn("manifest.get('nativeInputs') != sources", source)
        self.assertIn("retrieve_run_metadata(run_id, lock)", source)
        self.assertIn("ensure_candidate(candidate, lock, root)", source)
        self.assertIn("LEGACY_SHA", source)
        self.assertIn("No successful native CI artifact", source)

    def test_workflow_can_read_exact_github_actions_artifact(self):
        source = (ROOT / '.github/workflows/check.yml').read_text()
        self.assertIn('actions: read', source)
        self.assertIn('persist-credentials: false', source)

    def test_restoration_rejects_legacy_hash_and_verifies_all_sources(self):
        source = (ROOT / 'scripts/restore_independent_native_qa.py').read_text()
        self.assertIn('LEGACY_SHA', source)
        self.assertIn('historical', source.lower())
        self.assertIn('locked_inputs(root)', source)
        self.assertIn("independent-native-qa-with-sources", source)
        self.assertIn("lock.get(key) != manifest.get(key)", source)
        self.assertNotIn('restore-deployment-engine', source)


if __name__ == '__main__':
    unittest.main()
