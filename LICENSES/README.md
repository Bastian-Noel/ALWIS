# Component license files

This directory contains license texts and notices that may apply to components distributed by ALWIS. It is not a declaration that every listed component is present in every build. The exact release inventory is recorded in `release.json` and `THIRD-PARTY-NOTICES.md`.

| File | Component / use |
|---|---|
| `PolyForm-Noncommercial-1.0.0.txt` | Code original ALWIS indépendant explicitement identifié dans `LICENSE.md`; attribution `Required Notice:` obligatoire. Ne s'applique pas au runtime combiné GPLv2. |
| `GPL-2.0-only.txt` | MariaDB Community Server component in `pbl-runtime.wasm`; applicable only to the covered work and subject to its complete corresponding source obligations. |
| `LGPL-2.1-or-later.txt` | MariaDB Connector/C if present in the exact linked/distributed build; confirm against the pinned source and native link manifest. |
| `PHP-License-v4.txt` | PHP 8.4.27, for which ALWIS elects the subsequent PHP License v4 under the PHP Group’s published terms; per-file exceptions still apply. |
| `wolfSSL-LICENSING.txt` | wolfSSL at the pinned MariaDB submodule commit, including its MariaDB exception that permits GPLv2 for this combination. |
| `seanmorris-php-wasm-NOTICE.txt` | Copyright and upstream dual-license notice (Sean Morris, Oraoto). Only code covered by the dual license may use the GPLv2 option. |
| `Apache-2.0.txt` | Apache-2.0 components including the pinned MariaDB bridge source and bundled editor components; this text does not resolve GPLv2 compatibility for the applied MariaDB patch. |

The editor build generates `apps/studio/editor/dist/THIRD-PARTY.txt` from the locked npm dependencies and PHPantom/SuperHTML notices. ALWIS packaging carries that file separately. Do not treat it as a complete native-runtime SBOM.

ALWIS independently licensed original components are scoped under PolyForm in `LICENSE.md`; original documentation text is CC BY-NC-SA 4.0. This does not relicense the combined GPLv2 native runtime or clear its release blockers. See `provenance/component-license-map.md`.


## PHP 8.4.27 et Zend Engine : textes originaux et versions nouvelles

L'archive PHP 8.4.27 contient les licences PHP 3.01 et Zend Engine 2.00. Les textes complets originaux sont conservés dans PHP-8.4.27-original-3.01.txt et Zend-Engine-original-2.00.txt. PHP Group et Zend Technologies ont publié en 2026 les versions PHP v4 et Zend v3, compatibles BSD-3-Clause pour les fichiers couverts via leurs clauses de mise à niveau. Le texte regroupant leurs mentions se trouve dans PHP-License-v4.txt ; référence officielle https://www.php.net/license/

wolfSSL-LICENSING.txt reproduit le sous-module verrouillé, normalisation des seules lignes vides terminales. Pour Connector/C, vérifier la GNU Library GPL v2-or-later des en-têtes ; fournir simplement un texte LGPL-2.1 ne certifie pas chaque objet lié. Rapport : provenance/native-license-audit.md.
