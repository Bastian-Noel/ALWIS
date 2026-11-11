from pathlib import Path
import re
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class CurlCompatibilityTests(unittest.TestCase):
    def test_builtin_php_fixture_lints_without_external_php_extension(self):
        php = shutil.which('php')
        if not php:
            self.skipTest('System PHP CLI not installed (browser WASM CI remains mandatory)')
        files = ['packages/php-native/src/curl-compat.php',
                 'fixtures/compatibility/native-curl.php']
        for path in files:
            result = subprocess.run([php, '-n', '-l', str(ROOT/path)],
                                    text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

    def test_curl_shim_loaded_from_pinned_wasm_virtual_filesystem(self):
        cmake = (ROOT/'engine/native/build/runtime-target.cmake').read_text()
        worker = (ROOT/'packages/runtime/src/native-worker.mjs').read_text()
        self.assertIn('packages/php-native/src/curl-compat.php@/tmp/.alwis-curl-compat.php', cmake)
        self.assertIn('auto_prepend_file="/tmp/.alwis-curl-compat.php"', worker)

    def test_http_redirects_must_not_silently_follow_disallowed_redirects(self):
        c = (ROOT/'packages/network-native/src/http-stream.c').read_text()
        self.assertIn("follow_location?'follow':'error'", c)
        self.assertIn("HTTP request canceled", c)
        self.assertIn("AbortController()", c)
        self.assertIn("HTTP request timed out", c)

    def test_active_fetch_cancel_bypasses_same_worker_php_queue(self):
        worker = (ROOT/'packages/runtime/src/native-worker.mjs').read_text()
        facade = (ROOT/'packages/runtime/src/native-runtime.mjs').read_text()
        self.assertLess(worker.index("if (message.operation === 'abortHttp')"), worker.index('queue.run('))
        self.assertIn('abortHttp() { return this.call(', facade)

    def test_same_origin_host_http_endpoint_is_not_mistaken_for_php_recursion(self):
        import http.server
        import json
        import threading
        php = shutil.which("php")
        if not php:
            self.skipTest("PHP CLI unavailable")
        class Echo(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                data = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"hex": data.hex()}).encode())
            def log_message(self, *args):
                pass
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Echo)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        port = server.server_port
        try:
            code = (
                '$_SERVER["HTTP_HOST"]="127.0.0.1:' + str(port) + '";'
                '$_SERVER["SERVER_PORT"]="' + str(port) + '";'
                'require "packages/php-native/src/curl-compat.php";'
                '$h=curl_init("http://127.0.0.1:' + str(port) + '/echo");'
                'curl_setopt($h,CURLOPT_RETURNTRANSFER,true);'
                'curl_setopt($h,CURLOPT_POSTFIELDS,hex2bin("007f80ff"));'
                'echo json_encode(["response"=>curl_exec($h),"error"=>curl_error($h)]);'
            )
            proc = subprocess.run([php, "-n", "-r", code],
                cwd=ROOT, capture_output=True, text=True, timeout=10)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            result = json.loads(proc.stdout)
            self.assertEqual(json.loads(result["response"]), {"hex":"007f80ff"})
            self.assertEqual(result["error"], "")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_explicit_scope_and_self_site_safety(self):
        text = (ROOT/'packages/php-native/src/curl-compat.php').read_text()
        for symbol in ['curl_init', 'curl_exec', 'curl_setopt', 'curl_setopt_array',
                       'curl_getinfo', 'CURLOPT_RETURNTRANSFER', 'CURLOPT_POSTFIELDS',
                       'CURLOPT_TIMEOUT_MS', 'CURLOPT_FOLLOWLOCATION']:
            self.assertIn(symbol, text)
        self.assertIn('Recursive PHP self-request requires an independent executor', text)
        self.assertIn("Unsupported browser cURL option", text)


if __name__ == '__main__':
    unittest.main()
