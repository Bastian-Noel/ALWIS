# ALWIS HTTP compatibility in PHP 8.4 (browser Fetch)

The independent PHP/MariaDB WASM relies on browser Fetch, Asyncify and the
native PHP HTTP stream wrapper; there are no unrestricted TCP sockets.

## Candidate functionality (requires native Chromium/Firefox validation)

- PHP file_get_contents over HTTP(S) with GET/POST/custom method, request
  headers, binary bodies, ignore_errors, redirect behavior and timeouts.
- cURL compatibility subset: curl_init, curl_setopt, curl_setopt_array,
  curl_exec, curl_errno, curl_error, curl_getinfo, curl_close, curl_reset,
  curl_copy_handle, curl_escape, curl_unescape and curl_version.
- Common cURL options: URL, RETURNTRANSFER, POST, POSTFIELDS, HTTPHEADER,
  CUSTOMREQUEST, USERAGENT, TIMEOUT, TIMEOUT_MS, HEADER, NOBODY, HTTPGET,
  FAILONERROR and FOLLOWLOCATION.
- Fixed limits: 8 MiB request body, 16 MiB response, at most 180 seconds
  per Fetch, bounded header counts and lengths.
- Following redirects requires explicit CURLOPT_FOLLOWLOCATION. Without it,
  Fetch refuses redirects. Browser security may hide redirected response data.
- NativeRuntime.abortHttp() cancels only the current Asyncify Fetch directly
  from the Worker event loop; it cannot preempt CPU-only PHP or an SQL query.

## Self-site requests and deadlock prevention

The current native worker executes only one PHP script at a time. PHP
synchronously calling another PHP script from the same site would await its
own queue, leading to deadlock. To fail safely, ALWIS:
1. reads existing same-site static files directly from /workspace on GET;
2. refuses dynamic same-site routes and non-GET methods with a descriptive
   cURL error, even when the site's router rewrites URLs without .php suffix;
3. uses browser Fetch for other HTTP(S) requests, subject to CORS and TLS.

Dynamic PHP self-subrequests therefore remain UNSUPPORTED until an
independent re-entrant PHP executor or second worker can be validated.

## Unsupported options and known limits

This is a safe compatibility subset, NOT complete native libcurl. No
curl_multi, raw sockets, proxy CONNECT, custom TLS, cookie jars, CURLFile
multipart uploads, or unbounded redirects. Unknown options return false.
The CurlHandle class is a PHP userland compatibility object when ext/curl
is absent; class identity does not match upstream native libcurl.

The GPL-2.0-only shim is embedded in the corresponding-source WASM build via
auto_prepend_file, not copied from JoomEngine. Browser acceptance must pass:
tests/browser/native-curl.mjs in Chromium and Firefox, and the PHP source
fixture fixtures/compatibility/native-curl.php. Until those tests pass on
the new binary, treat the feature as implemented but UNVERIFIED.
