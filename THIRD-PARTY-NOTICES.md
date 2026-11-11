# Third-party notices for ALWIS distributions

**11 novembre 2026 — exception éditeur :** le code original détenu par Bastian Noël dans `apps/studio/editor/` est sous MIT (voir `LICENSES/ALWIS-editor-MIT.txt`), avec autorisation explicite du titulaire. Les composants tiers gardent leurs licences. Le worker incluant TypeScript n'est pas placé sous GPLv2 ; ses notices MIT et Apache-2.0 sont conservées dans le bundle de l'éditeur.
This notice summarizes known components. It is intentionally not a claim that the current inventory is exhaustive. The build-specific `release.json`, editor `THIRD-PARTY.txt`, native source manifest, and exact pinned source archives must be reviewed together for a complete release.

## Original ALWIS code and documentation

Original ALWIS software owned by Bastian Noël is offered under GPL-2.0-only, including commercial use. Original documentation remains CC BY-NC-SA 4.0. Third-party rights and licenses are unchanged. See `LICENSE.md` and `NOTICE.md`. This election does not itself resolve the release blockers below.

## Native runtime

- **Zend Engine (PHP 8.4.27)** — source Zend/LICENSE has Zend Engine License 2.00, preserved verbatim in [LICENSES/Zend-Engine-original-2.00.txt](LICENSES/Zend-Engine-original-2.00.txt). Zend Technologies published version 3.0 in 2026 under the original upgrade clause, with terms equivalent to BSD-3-Clause. ALWIS elects this newer version for covered Zend Engine files. The [PHP Group licensing page](https://www.php.net/license/) documents the option. The applicable Zend attribution is retained in [PHP License v4 and Zend v3 terms](LICENSES/PHP-License-v4.txt). Third-party files in Zend/ still require review.
- **PHP 8.4.27** — official PHP source; its original PHP License 3.01 is preserved in [LICENSES/PHP-8.4.27-original-3.01.txt](LICENSES/PHP-8.4.27-original-3.01.txt). For this distribution, ALWIS elects PHP License v4 for code covered by the PHP Group’s later-version clause. See [`LICENSES/PHP-License-v4.txt`](LICENSES/PHP-License-v4.txt). Per-file exceptions and the Zend Engine terms must be checked against the exact source files compiled.
- **Sean Morris / Oraoto PHP-WASM** — source at `seanmorris/php-wasm@1e1fb6703730759181e84c62bce35ee9129febb9` is dual licensed Apache-2.0 OR GPLv2. GPLv2 may be selected for **code covered by that dual license**. The upstream notice is included in [`LICENSES/seanmorris-php-wasm-NOTICE.txt`](LICENSES/seanmorris-php-wasm-NOTICE.txt). This does not license independent fork changes.
- **PCRE2 10.47** — the native PHP + MariaDB candidate uses the same pinned bundled PCRE2 library to avoid duplicate symbols. The exact upstream release archive is verified against SHA-256 \`d74c183c86c77248ad50017c7f45bae8f88106a6cca5d87ad09917e1c6fb0784\`; it is licensed BSD-3-Clause with PCRE2 exception. Preserve its [exact upstream licence](LICENSES/PCRE2-10.47-LICENCE.md) and source in the complete corresponding-source bundle. Presence of this notice is not a release approval.
- **PHP official release sources** — the compiled candidate uses the exact official \`php-8.4.27.tar.xz\` archive (SHA-256 \`dcf93923b0e38e0d5252b25b796520b5a47761a08b3488b6d0b5d1115764d3f0\`), in addition to the separate \`php/php-src\` research snapshot. Both must appear in the corresponding-source inventory; they are not interchangeable.
- **MariaDB Server** — GPL version 2; see [`LICENSES/GPL-2.0-only.txt`](LICENSES/GPL-2.0-only.txt). The exact corresponding source, modifications, build recipe and source access must accompany the binary distribution.
- **wolfSSL** — its pinned `LICENSING` notice offers GPLv3 with an exception to elect GPLv2 when combined with MariaDB Server. ALWIS elects that GPLv2 option for this combination; preserve [`LICENSES/wolfSSL-LICENSING.txt`](LICENSES/wolfSSL-LICENSING.txt).
- **MariaDB Connector/C** — the pinned submodule's libmariadb/include/mysql.h explicitly states **GNU Library General Public License v2 or later**, and its CMakeLists describes an LGPL library. Confirm exact linkage and version choice file by file. The included LGPL-2.1 text must not be mistaken for complete coverage of every submodule file. The applicable license and whether it is present in the exact final binary must be checked from the pinned source and link manifest. The LGPL-2.1 text is included at [`LICENSES/LGPL-2.1-or-later.txt`](LICENSES/LGPL-2.1-or-later.txt) where applicable.
- **JoomEngine PHP-WASM fork** — the pinned source at `joomengine/php-wasm@3b8cef42c020fbcbb6b41fad86716b7c8664b55b` is unavailable from GitHub and no exact source archive was located in accessible backups. Its archived binary carries upstream notices, but the specific native runner C source has not been recovered. A GPLv2-compatible independent replacement must be built and validated before releasing. See [recovery report](provenance/php-wasm-source-recovery.json).
- **JoomEngine MariaDB WASM bridge** — the repository root declares Apache-2.0, but the [specific notice at the historical pinned commit](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/patches/NOTICE) explicitly licenses the engine patch and modified glue GPL-2.0-only. The earlier Apache/GPL incompatibility claim for that patch was incorrect and is withdrawn. The independent ALWIS build does not apply that patch; retain its specific notice when redistributing historical patched code.

### Additional notices from the pinned native sources

The PHP configuration includes date, standard, TSRM, mbstring and fileinfo. The exact [timelib MIT](LICENSES/PHP-timelib-MIT.txt), [libavifinfo BSD](LICENSES/PHP-libavifinfo-BSD.txt) and [TSRM BSD](LICENSES/PHP-TSRM-BSD.txt) notices accompany the compiled native runtime. Preserve the exact [libmbfl LGPL 2.1 text](LICENSES/PHP-libmbfl-LGPL-2.1.txt) and [libmagic attribution and BSD terms](LICENSES/PHP-libmagic.txt). MariaDB's bundled sources also carry [Google InnoDB terms](LICENSES/MariaDB-InnoDB-Google.txt), [Percona InnoDB terms](LICENSES/MariaDB-InnoDB-Percona.txt), and [zlib terms](LICENSES/MariaDB-zlib.txt). These copies are traced to their exact archive paths and hashes in `provenance/additional-native-notices.json`; the final linked-object inventory remains to be checked.

### Emscripten system and JavaScript runtime

The native build uses Emscripten 6.0.6. ALWIS elects its MIT option for covered Emscripten code and preserves `LICENSES/Emscripten-6.0.6.txt` and its AUTHORS file. The bundled musl attribution is in `LICENSES/Emscripten-musl-COPYRIGHT.txt`. LLVM libc++, libc++abi, compiler-rt, llvm-libc and libunwind retain their exact upstream texts (the `LICENSES/Emscripten-*.txt` files), including LLVM exceptions where applicable. These are not plain Apache-2.0 grants without exceptions. The corresponding-source bundle includes the installed version's complete `system/` and `src/` runtime trees and per-file hashes; the compiler itself remains pinned by the build recipe. Notice identities are recorded in `provenance/toolchain-runtime-notices.json`.

## Editor and browser assets

- `typescript@5.9.3` and `@swc/wasm-web@1.16.21` are Apache-2.0. TypeScript is bundled into the JavaScript worker and SWC is shipped as a separate WASM file.
- `@bjorn3/browser_wasi_shim@0.4.2` is `MIT OR Apache-2.0`; ALWIS uses the MIT option.
- CodeMirror, Emmet, Prettier, PHPantom, SuperHTML, and other locked editor dependencies retain their own licenses. Their notices are generated in `apps/studio/editor/dist/THIRD-PARTY.txt` and copied to distributions.
- `axe-core` is a development dependency, not part of the static package build.

## Inspirations and source studies

DrawDB, ChartDB, Outerbase Studio, XYFlow, PHP-WASM projects and other repositories are recorded in `provenance/upstream-lock.json` and `provenance/source-map.csv`. A source being studied is not automatically included software. Any copied or adapted file must be individually identified in `provenance/reuse-ledger.csv`, with its upstream license and required notices. AGPL source may not be relicensed as ALWIS.

## Release status

`provenance/release-licensing-status.json` is authoritative for whether publication is enabled. Static, Docker, and native distribution are currently blocked pending a complete native source-to-binary inventory, review of the Apache-2.0 editor assets alongside the GPLv2 runtime, file-level comparison of recorded source studies, and release-specific verification of notices and corresponding sources. These notices do not cure those blockers.

## Deferred legacy PHP formatting issue (11 November 2026)

PHP `main/snprintf.c` and `main/spprintf.c` retain Apache Group 1995-1998 terms, including an advertising clause. Their exact embedded notice is reproduced in `LICENSES/PHP-formatting-legacy.txt`. The maintainer has deferred replacement and authorized continued development builds and QA. This internal exception does not relicense third-party code, establish GPLv2 compatibility, or clear the release gate. See `provenance/php-formatting-license-review.md`. These are two source files with multiple functions; the issue is not represented as a resolved or legally minor defect.
