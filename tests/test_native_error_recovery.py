"""Contract regression checks for PHP 8.4 request recovery."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "packages/php-native/src/runner.c"
WORKER = ROOT / "packages/runtime/src/native-worker.mjs"
TEST = ROOT / "tests/browser/native-error-recovery.mjs"
FIXTURE = ROOT / "fixtures/compatibility/native-error-recovery.php"


class NativeErrorRecoveryTests(unittest.TestCase):
    def test_exit_status_is_cleared_before_each_php_user_script(self):
        code = RUNNER.read_text()
        begin = code.index("EMSCRIPTEN_KEEPALIVE int php_wasm_run(")
        startup = code.index("if (php_request_startup() == SUCCESS)", begin)
        reset = code.index("EG(exit_status) = 0;", startup)
        execute = code.index("php_execute_script(&file)", reset)
        shutdown = code.index("php_request_shutdown(NULL)", execute)
        self.assertLess(startup, reset)
        self.assertLess(reset, execute)
        self.assertLess(execute, shutdown)
        self.assertNotIn("EG(exit_status) = 0;", code[execute:shutdown])

    def test_reset_matches_upstream_php_84_simple_script_semantics(self):
        reference = ROOT / "build-work/php-minimal/main/main.c"
        if not reference.is_file():
            self.skipTest("PHP 8.4 pinned-source workspace not present")
        code = reference.read_text()
        entry = code.index("PHPAPI int php_execute_simple_script(")
        self.assertIn("EG(exit_status) = 0;", code[entry:entry + 210])

    def test_shutdown_bailouts_caught_and_runtime_discarded(self):
        code = RUNNER.read_text()
        self.assertRegex(code, r"zend_try\s*\{\s*php_request_shutdown\(NULL\);")
        self.assertIn("escaped_php_bailout = true;", code)
        self.assertIn("php_failed = 1;", code)
        self.assertIn("pbl_mysql_owner_cleanup(owner)", code)
        self.assertIn("EMSCRIPTEN_KEEPALIVE int php_wasm_reusable(void)", code)
        worker = WORKER.read_text()
        self.assertIn("module._php_wasm_reusable?.()", worker)
        self.assertIn("poisoned = true;", worker)
        self.assertIn("Native PHP SAPI startup or shutdown failed", worker)

    def test_fatal_without_headers_not_reported_as_http_success(self):
        code = RUNNER.read_text()
        self.assertIn("!script_ok && !headers_emitted", code)
        self.assertIn("SG(sapi_headers).http_response_code = 500;", code)

    def test_regression_covers_php_sql_parse_and_explicit_exit(self):
        test = TEST.read_text()
        for variant in ('"throw"', '"check"', '"exit"', '"parse"', '"sql-error"', '"caught"'):
            self.assertIn(variant, test)
        self.assertIn("for (const [index, name] of cases.entries())", test)
        self.assertIn("rt.request(", test)
        self.assertIn("response.sqlConnections!==0", test)
        self.assertIn("response.nativeStatements!==0", test)
        self.assertIn("output:output.slice", test)
        fixture = FIXTURE.read_text()
        self.assertIn("beginTransaction()", fixture)
        self.assertIn("must-rollback", fixture)
        self.assertIn("exit(42)", fixture)


if __name__ == "__main__":
    unittest.main()
