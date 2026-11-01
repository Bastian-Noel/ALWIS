# Native PHP drivers and runtime integration

The PHP essential profile adds filter, ctype, mbstring (without mbregex), iconv, tokenizer and fileinfo to Core/date/hash/json/pcre/PDO/random/Reflection/session/SPL/standard plus native pdo_mysql/mysqli/pbl_native. It remains smaller than the extension set proposed in docs/BUILD.md: DOM/XML, ZIP/zlib, cURL, OpenSSL and GD are not loaded. The studio's JavaScript ZIP importer does not provide PHP ZipArchive. The previous minimal inventory is retained in `engine/fusion/receipts/php-inventory.json`; the new profile has separate browser receipts and a [current implementation report](../../engine/fusion/PHP-ESSENTIALS-RECEIPT.md).

This directory contains a real Zend C extension, not PHP implementations of mysqli functions. It shares `packages/sql-native/src/pbl_mysql.c` with the adapted stock PDO MySQL C driver. Both link to the same embedded MariaDB library in `pbl-runtime.wasm`.

`pbl_mysql.c` owns lazy SQL startup, the 32-caller connection limit, per-request owner IDs, connection teardown/rollback and SQL shutdown refusal while caller connections are alive. PHP request cleanup happens after Zend/PDO/MySQLi destructors; it does not reset the whole SQL server. The bootstrap connection is internal to MariaDB and not part of the caller count.

The generated driver copies are traceable through `driver-adapter.json`. Upstream source trees are retained. PDO uses PHP's external-client driver with native embedded connections, rather than the old asynchronous JSON/base64 host bridge. The adapter also fixes external-client length pointer types and excludes a MySQL-only JSON type case from the MariaDB build.

The custom PDO column adapter returns SQL integers that fit this PHP build's `zend_long` and SQL floating-point values as native PHP values, for prepared and direct results. `ATTR_STRINGIFY_FETCHES` preserves text when enabled. DECIMAL, oversized integers, numeric-looking VARCHAR, binary data and NULL retain their exact representation. The WASM build uses 32-bit PHP integers; converting every BIGINT to a PHP float would lose data. MySQLi also exposes native procedural/object savepoint creation and release, with bounded identifier quoting and ordinary SQL errors.

## Initial MySQLi surface

- Procedural and object connections, queries, prepared statements, close, charset and transactions.
- By-reference `bind_param` with i/d/s/b parameters read at execute time; NULL and binary string lengths stay native.
- `get_result`, `bind_result`/`fetch`, `store_result`, `fetch_assoc`, `fetch_row`, `fetch_array`, `fetch_all`, `data_seek`, result free and insert ID.
- SQL exceptions and the common report flags.

This is a subset, not a claim of complete MySQLi compatibility. Long-data streaming, multi-query, async mysqli and several metadata/statement APIs remain unimplemented. Native fetch_object, execute_query, stmt_init, separate stmt->prepare and the mysqli_stmt constructor are now exercised in both browsers. execute(array), basic field metadata, extension discovery, init/real_connect, autocommit and common diagnostic APIs are now implemented; see [the coverage matrix](COMPATIBILITY.md). Prepared results convert integers fitting zend_long and floating point types; DECIMAL, larger integers, binary and NULL remain lossless. This is not full mysqlnd parity. The standard school fixtures are the first integration acceptance gate; both unchanged fixtures and the object path pass on Chromium/Firefox; their results are recorded separately.

The result copy is limited to 16 MiB and 10,000 rows. The generated embedded protocol now also enforces a 16 MiB result-block budget and 10,000 rows while collecting text/binary results. This bounds result collection, not every query working allocation or the browser VFS; see `benchmarks/native/README.md`. Persistent connections and the full public `pbl_sql.h` cursor/batch contract still require dedicated implementation/validation.

## Files and networking

`packages/files-native/src/files.c` provides project-root path checks and POSIX write/fsync/rename, remove and rename operations. The JS worker facade uses them; PHP uses the same filesystem through normal file functions. The facade defaults to MEMFS and accepts a persistent projectKey to mount separate IDBFS file/SQL stores. save() closes the console, stops SQL and synchronizes the VFS; shutdown() then releases the project lock. Worker and full browser recreation/restoration are verified on both browsers; new projects use an atomic files/SQL/session checkpoint, while legacy split stores remain compatible within their limits. In-place SQL restart is refused after shutdown: recreate the runtime. See `engine/fusion/STORAGE-RECOVERY-RECEIPT.md`. fsync alone does not claim browser durability.

`packages/network-native/src/http-stream.c` registers HTTP/HTTPS read streams using browser Fetch and Asyncify inside the project worker. PHP `file_get_contents` therefore uses real browser HTTP. Browser CORS, redirects and credentials apply. The implementation handles method/content/ignore_errors, custom header string/arrays, timeout, wrapper response headers and `$http_response_header`. The response is limited during reading to 16 MiB and oversized transfers are aborted; see the [network transport](../network-native/README.md) for copy budgets and browser limitations. Complete HTTP wrapper parity remains open, including intermediate redirects and the wire protocol version.

Incoming HTTP/CGI semantics reuse the pinned native runtime with custom drivers installed at startup and targeted owner cleanup afterwards. `packages/runtime/src/native-runtime.mjs` exposes file operations, CGI requests, runtime state and SQL stop through a bounded queue in one project-owner worker. Clients must share that owner instead of creating a database per window. `apps/studio` now implements the Service Worker router, virtual client sessions and cross-window transport over this shared owner; its limits and verification command are documented there.

## Build and first end-to-end check

After the native source prerequisites in `engine/fusion/spike/README.md`:

```sh
source /workspace/toolchains/host/activate.sh
source /workspace/WASMWebServer/build-work/emsdk/emsdk_env.sh
cd /workspace/WASMWebServer
JOBS=3 bash scripts/build-php-essentials.sh
PBL_TARGET=pbl-runtime JOBS=3 bash engine/fusion/spike/build.sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/php-essentials.mjs
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node engine/fusion/spike/test-native-runtime.mjs
```

The integration check executes real files, GET/POST CGI, outgoing browser HTTP, both unchanged school fixtures and object MySQLi, then verifies connection cleanup and SQL stop. Do not describe an unexecuted or failed check as a working feature. Debug assertions and function names are currently kept in the native link to diagnose integration errors.
