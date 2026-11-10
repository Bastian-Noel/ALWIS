# ALWIS — vérification des licences du runtime PHP/MariaDB

**10 novembre 2026 — relevé de preuves, pas de validation juridique. Publication bloquée.**

Commande de reproduction :

    python3 scripts/audit-native-license-evidence.py --require-archives --source-root build-work/native-ci --output build-work/native-ci/native-license-evidence.json

Les contrôles sont également exécutés par GitHub Actions ; le rapport JSON contient les SHA-256 de chaque archive, la liste des fichiers natifs ALWIS et les preuves de licences. Il ne peut ni modifier ni débloquer la publication.

| Composant | Vérification réalisée | Limite restant ouverte |
|---|---|---|
| 7 archives amont | SHA-256 verrouillés : PHP 8.4.27 officiel, php/php-src, MariaDB, Sean Morris, PCRE2 10.47, wolfSSL et Connector/C | Les archives ne prouvent pas la liste exacte de tous les objets liés |
| PHP 8.4.27 | Texte original PHP 3.01 conservé à l'octet ; nouvelle licence PHP v4 publiée officiellement en 2026 | ALWIS choisit v4 pour le code couvert, sous la clause 5, avec contrôle des exceptions par fichier |
| Zend Engine | Texte original Zend 2.00 conservé à l'octet ; Zend v3.0 publié officiellement en 2026 | ALWIS choisit v3.0 pour le code couvert ; exceptions tierces à vérifier |
| MariaDB | Source originale GPLv2, build indépendant qui ne réutilise pas le patch JoomEngine Apache-2.0 | Distribution combinée et provenance complète des objets à vérifier |
| Sean Morris | Source verrouillée, licence GPLv2 OU Apache-2.0 pour le code couvert | Ne pas appliquer le double-licensing aux apports indépendants JoomEngine |
| wolfSSL | Texte historique comparé au fichier exact sous-module ; seules lignes terminales vides normalisées | Exception GPLv2 valable avec MariaDB selon sa portée ; liens effectifs à auditer |
| PCRE2 | Licence copiée exactement depuis l'archive ZIP 10.47 | Auditer toutes les dépendances supplémentaires |
| MariaDB Connector/C | En-tête mysql.h : GNU Library GPL v2 **ou ultérieure**, code CMake marqué LGPL | Ne pas assimiler automatiquement à LGPL-2.1. Lien effectif et texte choisi à vérifier |
| Éditeur | Artefacts TypeScript/SWC Apache-2.0 techniquement distincts du WASM GPLv2 | La frontière juridique de l'ensemble PolyForm/Apache/GPL reste à valider |
| Inspirations | 11 sources épinglées, aucun bloc identique de 32 tokens dans l'échantillon | Traductions, structures, assets et contributions doivent être relus humainement |

Références officielles : https://www.php.net/license/ (versions PHP v4 et Zend v3),
https://www.php.net/license/distrib-guidelines-code.php (mentions et exceptions par fichier),
https://www.apache.org/licenses/GPL-compatibility.html (incompatibilité Apache-2.0/GPLv2 pour le code incorporé).

## Résultat de l'inspection C

Les 14 sources et en-têtes ALWIS recensés comme entrées directes ou incluses par la cible native CMake incluent **4 en-têtes SPDX GPL-2.0-only explicites** et **10 fichiers sans SPDX**. Cette absence ne signifie pas une violation, mais il faut confirmer les droits d'auteur, documenter la provenance et expliciter les permissions fichier par fichier avant de distribuer. Le rapport JSON liste les dix fichiers.

## Revue à réaliser pour clore l'audit

1. Produire un manifeste de liaison fichier objet / bibliothèque / fichier source / titulaire / licence, pas seulement les sept archives amont.
2. Vérifier les exceptions des fichiers PHP/Zend/TSRM et les licences effectivement présentes dans Connector/C, wolfSSL, zlib et toutes les dépendances liées.
3. Confirmer la titularité des dix fichiers natifs sans SPDX ; conserver les auteurs tiers et accorder GPLv2 uniquement sur les portions réellement détenues.
4. Effectuer une revue humaine de l'originalité des adaptations et des assets, et du périmètre de l'éditeur sous PolyForm et Apache-2.0.
5. Générer un bundle exact associé au même SHA du WASM et au même tag, vérifier les notices et le moyen effectif d'obtenir les sources.
6. Examiner séparément les obligations liées au binaire historique déjà publié : un nouveau runtime conforme ne régularise pas rétroactivement l'ancien.

**Les cinq bloqueurs du statut de publication restent ouverts.** Les scénarios techniques 17/17 Chromium/Firefox et deux invités MariaDB/PHP ont réussi sur le nouveau moteur, mais ils ne valent pas autorisation de distribution.

Updated 10 November 2026: all 14 recorded ALWIS-owned native C sources and headers now carry GPL-2.0-only SPDX declarations. The ten previously missing identifiers are documented as maintainer-asserted original code, with the Git authorship reviewed in provenance/native-authorship-attestation.md. This does not prove independent authorship or clear third-party exceptions.
