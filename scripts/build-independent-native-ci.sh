#!/usr/bin/env bash
# Rebuild candidate from verified sources on disposable Linux x86-64.
# NEVER publishes or marks release licensing "ready" on a successful build.
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_dir"
if [[ $(uname -s) != Linux || $(uname -m) != x86_64 ]]; then
  echo "Independent native compilation requires Linux x86_64, no historical WASM fallback." >&2
  exit 1
fi
source build-work/emsdk/emsdk_env.sh
command -v emcc >/dev/null
emcc --version | head -n 1 | grep -F ' 6.0.6 ' >/dev/null
JOBS=2
php_build="$repo_dir/build-work/php-minimal"
maria="$repo_dir/build-work/mariadb-shallow"
native="$repo_dir/build-work/bridge/.native-build/engine/native"
wasm="$repo_dir/build-work/bridge/.native-build/engine/wasm"
test -f "$php_build/alwis-php84-fibers.json"
test -f "$maria/wasm/lite4mariadb.c"
python3 scripts/prepare-php84-source.py --verify-only >/dev/null
python3 scripts/prepare-native-concurrency.py "$maria" \
  --write --verify-pins --receipt build-work/independent-native-adapter.json

echo "::group::Build MariaDB host import executables"
cmake -S "$maria" -B "$native" \
  -DCMAKE_BUILD_TYPE=Release \
  -DWITH_EMBEDDED_SERVER=OFF -DWITH_UNIT_TESTS=OFF \
  -DWITH_WSREP=OFF -DWITH_SSL=system -DWITH_ZLIB=system \
  -DWITH_PCRE=system -DWITH_LIBFMT=bundled \
  -DUPDATE_SUBMODULES=OFF -DWITH_SYSTEMD=OFF \
  -DPLUGIN_COLUMNSTORE=NO -DPLUGIN_ROCKSDB=NO -DPLUGIN_MROONGA=NO \
  -DPLUGIN_SPIDER=NO -DPLUGIN_CONNECT=NO -DPLUGIN_OQGRAPH=NO \
  -DPLUGIN_DUCKDB=NO -DPLUGIN_S3=NO -DPLUGIN_VIDEX=NO
cmake --build "$native" --target import_executables -j"$JOBS"
test -f "$native/import_executables.cmake"
echo "::endgroup::"

echo "::group::Build pinned MariaDB Emscripten PCRE2 dependency"
emcmake cmake -S "$maria" -B "$wasm" \
  -DCMAKE_BUILD_TYPE=Release -DWITH_EMBEDDED_SERVER=ON \
  -DUPDATE_SUBMODULES=OFF -DWITH_PCRE=bundled \
  -DIMPORT_EXECUTABLES="$native/import_executables.cmake"
cmake --build "$wasm" --target pcre2 -j"$JOBS"
pcre_dir="$wasm/extra/pcre2/src/pcre2-build"
test -f "$pcre_dir/libpcre2-8.a"
test -f "$pcre_dir/interface/pcre2.h"
echo "::endgroup::"

echo "::group::Compile independent PHP 8.4.27 pthread/PDO archive"
cd "$php_build"
printf '%s\n' '{"type":"commonjs"}' > package.json
export PCRE2_CFLAGS="-I$pcre_dir/interface -DPCRE2_STATIC"
export PCRE2_LIBS="$pcre_dir/libpcre2-8.a"
export CFLAGS="-O2 -pthread"
export CXXFLAGS="-O2 -pthread"
export LDFLAGS="-pthread"
emconfigure ./configure \
  --disable-all --disable-cli --disable-cgi --disable-phpdbg \
  --enable-embed=static --disable-fiber-asm --without-pcre-jit --without-pear \
  --enable-pdo --enable-session --enable-filter --enable-ctype \
  --enable-tokenizer --enable-fileinfo --enable-mbstring --disable-mbregex \
  --with-iconv --with-external-pcre \
  ac_cv_func_fork=no ac_cv_func_vfork=no ac_cv_func_posix_spawn=no
emmake make -j"$JOBS" CPPFLAGS="-D_GNU_SOURCE -I$pcre_dir/interface -DPCRE2_STATIC" libphp.la
test -f .libs/libphp.a
sha256sum .libs/libphp.a
cd "$repo_dir"
echo "::endgroup::"

echo "::group::Link PHP SAPI with independent MariaDB"
PBL_TARGET=pbl-runtime JOBS="$JOBS" bash scripts/build-independent-native.sh
test -s "$wasm/runtime-dist/pbl-runtime.wasm"
test -s "$wasm/runtime-dist/pbl-runtime.mjs"
echo "::endgroup::"

echo "::group::Verify distinct native SHA and corresponding source bundle"
python3 - <<'PY'
from pathlib import Path
import hashlib,json
root=Path('build-work/bridge/.native-build/engine/wasm/runtime-dist')
wasm=root/'pbl-runtime.wasm'
sha=hashlib.sha256(wasm.read_bytes()).hexdigest()
assert sha!='80df46b7b308b33475fde138eb1a295c01ffbf6ac685d17a74209eb224674e0f', 'Historical WASM cannot satisfy independent native gate'
print('New native candidate:',wasm.stat().st_size,'bytes, SHA-256',sha)
Path('build-work/independent-native-build.json').write_text(
 json.dumps({'status':'compiled-candidate','wasmSha256':sha,
 'bytes':wasm.stat().st_size,'browserValidated':False,'releaseApproved':False},indent=2)+'\n')
PY
python3 scripts/package-native-sources.py --strict
echo "::endgroup::"
