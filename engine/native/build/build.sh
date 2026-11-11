#!/usr/bin/env bash
# Link already prepared PHP pthread objects into the pinned MariaDB cross build.
set -euo pipefail
spike_dir=$(cd "$(dirname "$0")" && pwd)
repo_dir=$(cd "$spike_dir/../../.." && pwd)
host_lock="$repo_dir/../toolchains/host/.setup.lock"
if [[ -d "$(dirname "$host_lock")" ]]; then exec 9>"$host_lock"; flock -s 9; fi
php_build=${PBL_PHP_BUILD:-"$repo_dir/build-work/php-minimal"}
mariadb_source=${PBL_MARIADB_SOURCE:-"$repo_dir/build-work/mariadb-shallow"}
mariadb_build=${PBL_MARIADB_BUILD:-"$repo_dir/build-work/bridge/.native-build/engine/wasm"}
native_build=${PBL_NATIVE_BUILD:-"$repo_dir/build-work/bridge/.native-build/engine/native"}
python3 "$repo_dir/scripts/prepare-php84-source.py" --output "$php_build" --verify-only >/dev/null
[[ -f "$php_build/.libs/libphp.a" && -f "$native_build/import_executables.cmake" ]] || {
  echo 'Prepare PHP pthread archive and MariaDB host tools first; see README.md' >&2
  exit 1
}
emcc --version | head -1 | grep -F ' 6.0.6 ' >/dev/null
if emar t "$php_build/.libs/libphp.a" | grep '^pcre2_' >/dev/null; then
  echo 'PHP still bundles PCRE2; rebuild with --with-external-pcre against MariaDB PCRE2.' >&2
  exit 1
fi
emcmake cmake -S "$mariadb_source" -B "$mariadb_build" \
  -DCMAKE_BUILD_TYPE=Release -DWITH_EMBEDDED_SERVER=ON -DUPDATE_SUBMODULES=OFF \
  -DIMPORT_EXECUTABLES="$native_build/import_executables.cmake" \
  -DCMAKE_PROJECT_TOP_LEVEL_INCLUDES="$spike_dir/attach.cmake" \
  -DPBL_SPIKE_SOURCE="$spike_dir" -DPBL_PHP_BUILD="$php_build"
cmake --build "$mariadb_build" --target "${PBL_TARGET:-pbl-runtime}" -j"${JOBS:-3}"
if [[ "${PBL_TARGET:-pbl-runtime}" == pbl-runtime ]]; then
  node "$repo_dir/scripts/inspect-wasm-abi.mjs" "$mariadb_build/runtime-dist/pbl-runtime.wasm" > "$mariadb_build/runtime-dist/abi.json"
else
  node "$repo_dir/scripts/inspect-wasm-abi.mjs" "$mariadb_build/fusion-dist/pbl-fusion.wasm" > "$mariadb_build/fusion-dist/abi.json"
fi
