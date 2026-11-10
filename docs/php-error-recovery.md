# ALWIS independent PHP 8.4: isolated lifecycle after fatal errors

Status: **runner fix and tests added; real Chromium/Firefox CI rebuild still
required**. No production change or release approval.

## Failure observed in CI

In GitHub Actions run 42882807112, the native browser test performed:

1. a normal PHP/PDO request establishing a committed SQL record;
2. a PHP request throwing an uncaught RuntimeException inside a transaction;
3. a normal POST request in the SAME long-lived WASM.

The third request returned PHP exit code 255 with no diagnostic, even though
the runtime had completed 17 parity tests and real P2P guest requests in both
browsers.

## Root cause in the official PHP 8.4 SAPI lifecycle

The upstream php_execute_script() entrypoint does NOT reset EG(exit_status).
Fatal PHP errors and explicit exit(42) may leave a nonzero exit status that
the ALWIS runner mistakenly copied to subsequent requests.

The official PHP 8.4 helper php_execute_simple_script() explicitly resets
EG(exit_status) before executing a script. ALWIS uses the HTTP SAPI, not this
CLI helper. It now resets EG(exit_status) after each successful
php_request_startup() and BEFORE running user code, never afterward.

## Engine isolation and cleanup

- Ordinary uncaught PHP exceptions are cleaned up by PHP's normal shutdown
  sequence, which lets the SAME WASM handle subsequent requests.
- If PHP reports an uncaught error before headers are emitted, ALWIS sends
  HTTP 500 instead of incorrectly returning HTTP 200.
- An explicit nonzero PHP exit code belongs only to its current request.
- A bailout escaping the PHP executor, failed startup, or bailout during
  shutdown marks the engine non-reusable. The worker sees
  php_wasm_reusable() returning zero and refuses unsafe subsequent work.
  The export is part of the mandatory WASM ABI: missing functions also fail
  closed instead of silently falling back to an older binary.
- SQL owner cleanup closes and rolls back abandoned transactions and
  releases prepared statements and connections.
- SG(server_context) remains live through php_request_shutdown() for
  HTTP POST, php://input and cookie parsing, then is cleared afterward.

## Browser regression test

tests/browser/native-error-recovery.mjs uses ONE native runtime per browser
for 14 consecutive requests, covering: normal SQL, unhandled PHP exception
and rollback, two subsequent POSTs, exit(42) then POST, ParseError then POST,
uncaught PDOException in an open SQL transaction then POST, caught exception
then POST, and another fatal exception followed by a successful POST.

Each operation validates HTTP status, exit code, body, SQL row count and
the absence of leaked native SQL connections or prepared statements.
Failing runs persist diagnostics to build-work/native-recovery/browser.json.
The test must succeed in Chromium and Firefox alongside existing parity,
two-guest WebRTC/PDO, load, restart and source-license checks.
