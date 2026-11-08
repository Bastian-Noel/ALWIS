# Third-party notices for ALWIS distributions

This notice summarizes known components. It is intentionally not a claim that the current inventory is exhaustive. The build-specific `release.json`, editor `THIRD-PARTY.txt`, native source manifest, and exact pinned source archives must be reviewed together for a complete release.

## Native runtime

- **PHP 8.4.27** — official PHP source; the source archive carries PHP License 3.01. For this distribution, ALWIS elects PHP License v4 for code covered by the PHP Group’s later-version clause. See [`LICENSES/PHP-License-v4.txt`](LICENSES/PHP-License-v4.txt). Per-file exceptions and the Zend Engine terms must be checked against the exact source files compiled.
- **MariaDB Server** — GPL version 2; see [`LICENSES/GPL-2.0-only.txt`](LICENSES/GPL-2.0-only.txt). The exact corresponding source, modifications, build recipe and source access must accompany the binary distribution.
- **wolfSSL** — its pinned `LICENSING` notice offers GPLv3 with an exception to elect GPLv2 when combined with MariaDB Server. ALWIS elects that GPLv2 option for this combination; preserve [`LICENSES/wolfSSL-LICENSING.txt`](LICENSES/wolfSSL-LICENSING.txt).
- **MariaDB Connector/C** — source lock records the pinned submodule; the applicable license and whether it is present in the exact final binary must be checked from the pinned source and link manifest. The LGPL-2.1 text is included at [`LICENSES/LGPL-2.1-or-later.txt`](LICENSES/LGPL-2.1-or-later.txt) where applicable.
- **JoomEngine MariaDB WASM bridge** — pinned source repository declares Apache-2.0. Its `patches/engine/independent-sessions.patch` is applied to MariaDB in the native build. Apache-2.0 is not compatible with GPLv2 for code incorporated in a combined work. **Distribution of the combined runtime is blocked until the exact rights are clarified, compatible permission is obtained, or the patch is replaced.** See [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt) and the [pinned patch](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/patches/engine/independent-sessions.patch).

## Editor and browser assets

- `typescript@5.9.3` and `@swc/wasm-web@1.16.21` are Apache-2.0. TypeScript is bundled into the JavaScript worker and SWC is shipped as a separate WASM file.
- `@bjorn3/browser_wasi_shim@0.4.2` is `MIT OR Apache-2.0`; ALWIS uses the MIT option.
- CodeMirror, Emmet, Prettier, PHPantom, SuperHTML, and other locked editor dependencies retain their own licenses. Their notices are generated in `apps/studio/editor/dist/THIRD-PARTY.txt` and copied to distributions.
- `axe-core` is a development dependency, not part of the static package build.

## Inspirations and source studies

DrawDB, ChartDB, Outerbase Studio, XYFlow, PHP-WASM projects and other repositories are recorded in `provenance/upstream-lock.json` and `provenance/source-map.csv`. A source being studied is not automatically included software. Any copied or adapted file must be individually identified in `provenance/reuse-ledger.csv`, with its upstream license and required notices. AGPL source may not be relicensed as ALWIS.

## Release status

`provenance/release-licensing-status.json` is authoritative for whether publication is enabled. Static, Docker, and native distribution are currently blocked pending resolution of the Apache-2.0/GPLv2 MariaDB patch, a complete native source-to-binary inventory, review of the Apache-2.0 editor assets alongside the GPLv2 runtime, file-level comparison of recorded source studies, and release-specific verification of notices and corresponding sources. These notices do not cure those blockers.
