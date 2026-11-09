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
[[ -f "$php_build/.libs/libphp.a" && -f "$native_build/import_executables.cmake" ]] || {
  echo 'Prepare PHP pthread archive and MariaDB host tools first; see README.md' >&2
  exit 1
}
emcc --version | head -1 | grep -F ' 6.0.6 ' >/dev/null
if emar t "$php_build/.libs/libphp.a" | grep '^pcre2_' >/dev/null; then
  echo 'PHP still bundles PCRE2; rebuild with --with-external-pcre against MariaDB PCRE2.' >&2
  exit 1
fi
# Opt-in migration path: create only ALWIS-owned scheduling changes in a
# disposable, unpatched MariaDB checkout. Never rewrite source snapshots.
if [[ "${PBL_INDEPENDENT_NATIVE:-0}" == 1 ]]; then
  [[ "${PBL_TARGET:-}" == pbl-runtime ]] || {
    echo 'Independent native adapter is only supported for the ALWIS pbl-runtime target.' >&2
    exit 1
  }
  source_real=$(realpath "$mariadb_source")
  case "$source_real" in
    "$repo_dir"/build-work/*) ;;
    *) echo 'Independent native adapter requires a disposable build-work source tree.' >&2; exit 1 ;;
  esac
  if grep -q 'l4m_session_open' "$mariadb_source/wasm/lite4mariadb.c"; then
    echo 'Do not build an Apache-licensed sessions patch into the independent native candidate.' >&2
    exit 1
  fi
  python3 "$repo_dir/scripts/prepare-native-concurrency.py" "$mariadb_source" \
    --write --verify-pins --receipt "$repo_dir/build-work/independent-native-adapter.json"
fi
emcmake cmake -S "$mariadb_source" -B "$mariadb_build" \
  -DCMAKE_BUILD_TYPE=Release -DWITH_EMBEDDED_SERVER=ON -DUPDATE_SUBMODULES=OFF \
  -DIMPORT_EXECUTABLES="$native_build/import_executables.cmake" \
  -DCMAKE_PROJECT_TOP_LEVEL_INCLUDES="$spike_dir/attach.cmake" \
  -DPBL_SPIKE_SOURCE="$spike_dir" -DPBL_PHP_BUILD="$php_build"
cmake --build "$mariadb_build" --target "${PBL_TARGET:-pbl-fusion}" -j"${JOBS:-3}"
if [[ "${PBL_TARGET:-pbl-fusion}" == pbl-runtime ]]; then
  node "$repo_dir/scripts/inspect-wasm-abi.mjs" "$mariadb_build/runtime-dist/pbl-runtime.wasm" > "$mariadb_build/runtime-dist/abi.json"
else
  node "$repo_dir/scripts/inspect-wasm-abi.mjs" "$mariadb_build/fusion-dist/pbl-fusion.wasm" > "$mariadb_build/fusion-dist/abi.json"
fi
