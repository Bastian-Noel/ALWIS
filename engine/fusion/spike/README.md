# First same-module PHP → C → embedded MariaDB experiment

This is a build/runtime experiment, not the final PDO/MySQLi backend. A successful syntax check or native archive alone does not close the browser gate. See the accompanying receipt for the latest actual result.

## Choice of sources and ABI

- PHP 8.4.27 from the official tarball pinned in JoomEngine `3b8cef42c020fbcbb6b41fad86716b7c8664b55b/versions.json`, SHA-256 `dcf93923b0e38e0d5252b25b796520b5a47761a08b3488b6d0b5d1115764d3f0`.
- PHP's small embed/PDO/session configuration is rebuilt from source with `-pthread`. Its archive is not taken from the nonshared upstream PHP binary. The pinned JoomEngine `php-8.4-fibers.patch` adapts Zend fibers to Emscripten/Asyncify. PHP uses its supported external-PCRE configuration against MariaDB’s PCRE2 10.47; keeping both bundled PCRE copies produces duplicate symbols.
- MariaDB `24be9371a2f6c71250a2356631ad6feab2280b02`, exact libmariadb/wolfSSL gitlinks, and the independently reviewed sessions patch from bridge `56d47b4dc867af313592efa09e12df470a36e129`. This uses its native server changes, not its Sean Morris PHP SIDE_MODULE PDO adapter.
- Emscripten 6.0.6. Final link: shared memory/pthreads, C++ exceptions, Asyncify, 256 MiB initial, 2 GiB configured maximum, 16 MiB stack, 16 worker pool. These are experimental compatibility settings, not the final reduced SQL profile.

This is a new integration chain requiring its own validation. It does not assert interchangeability of the two upstream PHP/bridge families. The separate JoomEngine 0.1.1 witness remains intact.

`pbl_select_one()` is a PHP native function compiled into the final module. Its lazy bootstrap uses `l4m_open`; its query/result path calls `mysql_init`, `mysql_real_connect`, `mysql_real_query`, `mysql_store_result`, `mysql_fetch_row` and `RETVAL_STRINGL` directly. The SQL/results never pass through the upstream `l4m_query` JSON API or a JavaScript hostcall. The two engines share the libc allocator in the final link. `pbl_direct_calls` counts completed direct calls; PHP itself checks the result is exactly the string `1`.

The test uses a dedicated browser worker and MariaDB's auxiliary pthread workers. One principal WASM module does not imply one operating-system thread.

## Preparation on this instance

The selected repository is already isolated: use it directly; do not create a worktree. Preserve source snapshots and local work. `scripts/setup-cloud.sh` prepares rootless Debian 13 host tools and the pinned SDK. Activate them in each native-build shell:

```sh
source /workspace/toolchains/host/activate.sh
source /workspace/WASMWebServer/build-work/emsdk/emsdk_env.sh
```

Do not refresh installed tools while compiling. The setup helper and `build.sh` use an exclusive/shared lock to prevent that conflict.

The PHP source was downloaded with HTTPS and checked against the pinned SHA-256 before extraction to `build-work/php-minimal`. Apply the pinned fiber patch to this disposable source tree before building. An extensionless Autoconf probe must run as CommonJS, matching the upstream build recipe:

```sh
cd /workspace/WASMWebServer
patch -d build-work/php-minimal -p1 --fuzz=0 --batch --forward < build-work/php/patches/php-8.4-fibers.patch
printf '%s\n' '{"type":"commonjs"}' > build-work/php-minimal/package.json
cd build-work/php-minimal
pcre_build=/workspace/WASMWebServer/build-work/bridge/.native-build/engine/wasm/extra/pcre2/src/pcre2-build
PCRE2_CFLAGS="-I$pcre_build/interface -DPCRE2_STATIC" PCRE2_LIBS="$pcre_build/libpcre2-8.a" \
  CFLAGS='-O2 -pthread' CXXFLAGS='-O2 -pthread' LDFLAGS='-pthread' \
  emconfigure ./configure --disable-all --disable-cli --disable-cgi --disable-phpdbg \
  --enable-embed=static --disable-fiber-asm --without-pcre-jit --without-pear \
  --enable-pdo --enable-session --with-external-pcre ac_cv_func_fork=no ac_cv_func_vfork=no ac_cv_func_posix_spawn=no
emmake make -j3 CPPFLAGS="-D_GNU_SOURCE -I$pcre_build/interface -DPCRE2_STATIC" libphp.la
```

Build MariaDB’s PCRE2 target before configuring PHP against these paths; the original bundled-PCRE attempt is retained only as an error diagnosis. The generated header is in `pcre2-build/interface`, not its root. Preserve `-D_GNU_SOURCE` when overriding CPPFLAGS.

Do not reapply the fiber patch to an already patched checkout. In that case, reuse the verified tree and build products.

MariaDB is fetched with `git init`/`git fetch --depth 1` at the pinned commit into `build-work/mariadb-shallow`; fetch its two submodules at their gitlinks. The pinned bridge builder applies and verifies its native sessions patch. Its `ENGINE_SOURCE_DIR` selects the disposable source tree and its host/cross outputs live under `build-work/bridge/.native-build/engine/{native,wasm}`.

An interrupted host build can leave `import_executables.cmake` before producing all referenced tools. If a cross build reports a missing `gen_lex_token`, finish the host target explicitly rather than discarding valid cross outputs:

```sh
cmake --build build-work/bridge/.native-build/engine/native --target import_executables -j3
```

For a first rootless host configure, `CMAKE_PREFIX_PATH=/workspace/toolchains/host/usr` lets CMake find the extracted ncurses development files. The activation script supplies Bison's data directory and the explicit M4 binary path.

## Link and browser gate

```sh
cd /workspace/WASMWebServer
JOBS=3 bash engine/fusion/spike/build.sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright \
  node engine/fusion/spike/test-browser.mjs \
  build-work/bridge/.native-build/engine/wasm/fusion-dist \
  build-work/php/node_modules/playwright/index.mjs
```

`build.sh` injects the target into the pinned MariaDB cross build using a deferred CMake include; it does not edit upstream CMake files. Existing PHP and server objects are reused. Override the documented `PBL_PHP_BUILD`, `PBL_MARIADB_SOURCE`, `PBL_MARIADB_BUILD` and `PBL_NATIVE_BUILD` variables only with compatible prepared outputs.

The browser gate requires cross-origin isolation, no eager SQL startup, successful PHP evaluation, one completed native SELECT and exact output, then an explicit SQL shutdown. A 180-second worker timeout fails the test. Each successful browser writes a receipt; absent receipts are not success. On this cloud machine Firefox needs the supported outer process context because its profile startup fails in the restricted process namespace.

## Not demonstrated by this spike

A PHP SQL helper is not PDO/MySQLi compatibility. Repeated SQL restart, PHP-only execution while stopping SQL, independent owners, cancellation, SQL error/type coverage, storage recovery, resource limits and performance comparison still require later gates. The initial profile is intentionally not a memory optimization claim.
