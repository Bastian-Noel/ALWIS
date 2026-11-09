import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/audit-source-reuse.py"
spec = importlib.util.spec_from_file_location("audit_source_reuse", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourceTriageTests(unittest.TestCase):
    def test_detects_long_identical_region(self):
        original = "function example () { " + " ".join(f"var{i}" for i in range(60)) + " }"
        reference = module.tokens(original)
        tokens = {"local.mjs": reference}
        index = {}
        for key, at in module.rolling_windows(reference):
            index.setdefault(key, []).append(("local.mjs", at))
        found = module.find_spans(reference, index, tokens)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["matchingTokens"], len(reference))

    def test_does_not_match_short_generic_code(self):
        reference = module.tokens("const a = 1;")
        self.assertEqual(module.find_spans(reference, {}, {}), [])

    def test_rejects_comment_only_match(self):
        original = module.tokens("/* fake function code */ const a = 1;")
        self.assertNotIn("fake", original)


if __name__ == "__main__":
    unittest.main()
