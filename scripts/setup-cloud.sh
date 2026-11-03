#!/usr/bin/env bash
# Refresh the retained development environment without system-wide writes.
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
workspace_dir=$(cd "$repo_dir/.." && pwd)
cache_dir="$workspace_dir/.cache"
host_dir="$workspace_dir/toolchains/host"
export npm_config_cache="$cache_dir/npm"
export PLAYWRIGHT_BROWSERS_PATH="$cache_dir/ms-playwright"
cd "$repo_dir"
. /etc/os-release
[[ "$ID" == debian && "$VERSION_ID" == 13 ]] || {
  echo 'This rootless package recipe is tested on Debian 13 only.' >&2; exit 1;
}
mkdir -p "$cache_dir/apt/lists/partial" "$cache_dir/apt/archives/partial" "$cache_dir/apt/packages" "$host_dir" build-work
exec 9>"$host_dir/.setup.lock"
flock -x 9
cat > "$cache_dir/apt/sources.list" <<'SOURCES'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
SOURCES
apt_options=(-o "Dir::State::lists=$cache_dir/apt/lists" -o "Dir::Cache::archives=$cache_dir/apt/archives"
  -o "Dir::Etc::sourcelist=$cache_dir/apt/sources.list" -o Dir::Etc::sourceparts=- -o "APT::Sandbox::User=$(id -un)")
/usr/bin/apt-get "${apt_options[@]}" update
(cd "$cache_dir/apt/packages" && /usr/bin/apt-get "${apt_options[@]}" download \
  cmake cmake-data ninja-build bison re2c autoconf automake libtool m4 \
  libuv1t64 librhash1 libjsoncpp26 libarchive13t64 libncurses-dev libtinfo6 libncurses6 libncursesw6)
for package in "$cache_dir/apt/packages/"*.deb; do dpkg-deb -x "$package" "$host_dir"; done
python3 - "$host_dir" <<'PY'
import shlex,sys
from pathlib import Path
p=Path(sys.argv[1]); q=lambda s:shlex.quote(str(p/s))
(p/'activate.sh').write_text('\n'.join([
 'export PATH='+q('usr/bin')+':$PATH',
 'export LD_LIBRARY_PATH='+q('usr/lib/x86_64-linux-gnu')+'${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}',
 'export autom4te_perllibdir='+q('usr/share/autoconf'),
 'export AC_MACRODIR='+q('usr/share/autoconf'),
 'export AUTOM4TE_CFG='+q('usr/share/autoconf/autom4te.cfg'),
 'export AUTOMAKE_LIBDIR='+q('usr/share/automake-1.17'),
 'export BISON_PKGDATADIR='+q('usr/share/bison'),
 'export M4='+q('usr/bin/m4'),
])+'\n')
PY
source "$host_dir/activate.sh"
checkout_pinned() {
  local directory=$1 repository=$2 revision=$3
  if [[ ! -e "$directory" ]]; then
    git init -q "$directory"
    git -C "$directory" remote add origin "$repository"
    git -C "$directory" fetch --depth 1 origin "$revision"
    git -C "$directory" checkout --detach FETCH_HEAD
  fi
  [[ $(git -C "$directory" rev-parse HEAD) == "$revision" ]] || {
    echo "Unexpected source revision at $directory; preserving existing files." >&2; exit 1;
  }
}
checkout_pinned build-work/emsdk https://github.com/emscripten-core/emsdk.git d7b4130688bfa348392b921ab04015aa15c4f154
build-work/emsdk/emsdk install 6.0.6
build-work/emsdk/emsdk activate 6.0.6
source build-work/emsdk/emsdk_env.sh
checkout_pinned build-work/php https://github.com/joomengine/php-wasm.git 3b8cef42c020fbcbb6b41fad86716b7c8664b55b
if [[ ! -s build-work/php/dist/php/8.4/php.wasm ]]; then
  artifact_dir="$repo_dir/build-work/artifacts/baseline-php-8.4"
  if [[ ! -s "$artifact_dir/php/dist/php/8.4/php.wasm" ]]; then
    gh run download 41212524552 --repo Bastian-Noel/ALWIS --name baseline-php-8.4 --dir "$artifact_dir"
  fi
  [[ ! -e build-work/php/dist ]] || { echo 'Preserving existing partial dist; inspect it before restoring.' >&2; exit 1; }
  cp -a "$artifact_dir/php/dist" build-work/php/
fi
python3 - <<'PY'
from pathlib import Path
import hashlib,json
root=Path('build-work/php/dist/php/8.4')
receipt=json.loads((root/'mariadb-driver.json').read_text())
for name,key in [('php.mjs','moduleSha256'),('php.wasm','wasmSha256')]:
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=receipt[key]:
  raise SystemExit('Engine asset does not match its retained build receipt: '+name)
PY
(cd build-work/php && npm ci --ignore-scripts && npm run prepare:mariadb && npx playwright install --only-shell chromium firefox)
emcc --version | head -1
cmake --version | head -1
