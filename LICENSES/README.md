# Component license files

This directory contains license texts and notices that may apply to components distributed by ALWIS. It is not a declaration that every listed component is present in every build. The exact release inventory is recorded in `release.json` and `THIRD-PARTY-NOTICES.md`.

| File | Component / use |
|---|---|
| `PolyForm-Noncommercial-1.0.0.txt` | Code original ALWIS indépendant explicitement identifié dans `LICENSE.md`; attribution `Required Notice:` obligatoire. Ne s'applique pas au runtime combiné GPLv2. |
| `GPL-2.0-only.txt` | MariaDB Community Server component in `pbl-runtime.wasm`; applicable only to the covered work and subject to its complete corresponding source obligations. |
| `LGPL-2.1-or-later.txt` | MariaDB Connector/C if present in the exact linked/distributed build; confirm against the pinned source and native link manifest. |
| `PHP-License-v4.txt` | PHP 8.4.27, for which ALWIS elects the subsequent PHP License v4 under the PHP Group’s published terms; per-file exceptions still apply. |
| `wolfSSL-LICENSING.txt` | wolfSSL at the pinned MariaDB submodule commit, including its MariaDB exception that permits GPLv2 for this combination. |
| `Apache-2.0.txt` | Apache-2.0 components including the pinned MariaDB bridge source and bundled editor components; this text does not resolve GPLv2 compatibility for the applied MariaDB patch. |

The editor build generates `apps/studio/editor/dist/THIRD-PARTY.txt` from the locked npm dependencies and PHPantom/SuperHTML notices. ALWIS packaging carries that file separately. Do not treat it as a complete native-runtime SBOM.

ALWIS independently licensed original components are scoped under PolyForm in `LICENSE.md`; original documentation text is CC BY-NC-SA 4.0. This does not relicense the combined GPLv2 native runtime or clear its release blockers. See `provenance/component-license-map.md`.
