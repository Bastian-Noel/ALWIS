#!/usr/bin/env bash
# Explicit opt-in to the experimental ALWIS-owned MariaDB adapter.
# Kept separate so historical native release source manifests remain verifiable.
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
mariadb_source=${PBL_MARIADB_SOURCE:-"$repo_dir/build-work/mariadb-shallow"}
source_real=$(realpath "$mariadb_source")
case "$source_real" in
  "$repo_dir"/build-work/*) ;;
  *) echo 'Independent native adapter requires a disposable source in build-work/.' >&2; exit 1 ;;
esac
[[ "${PBL_TARGET:-pbl-runtime}" == pbl-runtime ]] || { echo 'Only pbl-runtime supported.' >&2; exit 1; }
[[ -f "$mariadb_source/wasm/lite4mariadb.c" ]] || { echo 'Prepare the pinned clean MariaDB source first.' >&2; exit 1; }
if grep -q 'l4m_session_open' "$mariadb_source/wasm/lite4mariadb.c"; then
  echo 'Refusing source with the legacy Apache sessions patch.' >&2
  exit 1
fi
python3 "$repo_dir/scripts/prepare-native-concurrency.py" "$mariadb_source" --write --verify-pins --receipt "$repo_dir/build-work/independent-native-adapter.json"
PBL_TARGET=pbl-runtime PBL_INDEPENDENT_PHP_RUNNER=ON bash "$repo_dir/engine/native/build/build.sh"
