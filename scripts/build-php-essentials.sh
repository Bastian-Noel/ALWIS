#!/usr/bin/env bash
# Extend the pinned PHP pthread archive; retain the last minimal build as a witness.
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
php_build="$repo_dir/build-work/php-minimal"
host_root="$repo_dir/../toolchains/host"
source "$host_root/activate.sh"
source "$repo_dir/build-work/emsdk/emsdk_env.sh"
exec 9>"$host_root/.setup.lock"; flock -s 9
[[ -f "$php_build/config.nice" && -f "$php_build/.libs/libphp.a" ]] || { echo 'Prepare the pinned pthread PHP source/archive first.' >&2; exit 1; }
rg -q '#define PHP_VERSION "8\.4\.27"' "$php_build/main/php_version.h" || { echo 'Unexpected PHP version; preserving source.' >&2; exit 1; }
backup="$repo_dir/build-work/native-profiles/php-minimal-before-essentials"
mkdir -p "$backup"
for name in config.nice main/php_config.h .libs/libphp.a; do
  destination="$backup/$(basename "$name")"
  if [[ ! -e "$destination" ]]; then cp "$php_build/$name" "$destination"; fi
done
cd "$php_build"
emconfigure ./config.nice --enable-filter --enable-ctype --enable-tokenizer \
  --enable-fileinfo --enable-mbstring --disable-mbregex --with-iconv
pcre_build="$repo_dir/build-work/bridge/.native-build/engine/wasm/extra/pcre2/src/pcre2-build"
emmake make -j"${JOBS:-3}" CPPFLAGS="-D_GNU_SOURCE -I$pcre_build/interface -DPCRE2_STATIC" libphp.la
sha256sum .libs/libphp.a
