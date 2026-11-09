# Reprise de la conformité de redistribution d'ALWIS

**10 novembre 2026 · État : publication toujours bloquée.** Les éléments ci-dessous sont des preuves techniques et une liste de tâches, pas une attestation juridique.

## Ce qui est maintenant vérifié

| Sujet | Preuve | Résultat | Limite |
| --- | --- | --- | --- |
| Inspirations DrawDB, ChartDB, Outerbase et XYFlow | [Revue par empreintes et tokens](source-reuse-automated-review.json), exécutable `scripts/audit-source-reuse.py` | 11/11 fichiers sources au SHA-256 attendu ; aucun segment identique de 32 tokens consécutifs dans les modules locaux sélectionnés | Une réécriture de logique, du CSS ou une reprise de design ne sont pas détectés ; revue humaine des contributions et auteurs requise |
| Éditeur TypeScript/SWC vs MariaDB | [Frontière de compilation](editor-license-boundary.md) et `scripts/verify-editor-boundary.py` | Fichiers et recettes de build distincts ; TypeScript/SWC non liés dans `pbl-runtime.wasm` d'après la recette | Le paquet web complet et ses interactions peuvent nécessiter une analyse juridique |
| Source native amont | `scripts/audit-native-inputs.py` et `scripts/package-native-sources.py` | 5 archives upstream/submodules récupérées et SHA-256 vérifiés localement | Source du fork `joomengine/php-wasm` indisponible et aucun nouveau WASM construit |
| Droits PHP/Zend | [PHP Group](https://www.php.net/license/) | PHP License v4 et Zend Engine License v3 exerçables pour les versions antérieures couvertes ; licences de type BSD-3-Clause, compatibles GPL | Exceptions licence fichier par fichier du PHP compilé à inventorier |
| PHP-WASM de Sean Morris | [Commit épinglé](https://github.com/seanmorris/php-wasm/tree/1e1fb6703730759181e84c62bce35ee9129febb9), [NOTICE](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/NOTICE) | Source originale doublement licenciée Apache-2.0 / GPL-2.0 ; option GPL-2.0 applicable au code couvert | Ne prouve pas que toutes les modifications indépendantes du fork JoomEngine possèdent cette option |
| wolfSSL | `LICENSES/wolfSSL-LICENSING.txt` (commit épinglé) | Exception GPLv2 pour combinaison MariaDB Server identifiée | Correspondance exacte de compilation et inclusion réelle encore à établir |
| Notices FTP/Docker | `scripts/verify-studio-legal.py` dans la CI | Textes et avis de tiers vérifiés dans le paquet d'essai | Les sources complètes d'un nouveau binaire ne sont pas encore incluses |

## Le blocage matériel prioritaire

La recette `scripts/prepare-native-drivers.py` utilise `build-work/php/native/runtime.c` ainsi que l'arbre PHP modifié. Le dépôt historique `joomengine/php-wasm@3b8cef42c020fbcbb6b41fad86716b7c8664b55b` répond **404** et l'archive dont l'empreinte est épinglée n'est pas disponible sur le serveur.

Archive nécessaire :

- Nom attendu : `joomengine--php-wasm-3b8cef42c020fbcbb6b41fad86716b7c8664b55b.tar.gz`
- SHA-256 : `d30679568282f94ede723c5313ba2664380ede421cfb27693dcc9bc9fe9a533c`
- Emplacement de travail conseillé : `build-work/source-archives/` (non versionné)
- Vérification : `python3 scripts/package-native-sources.py --strict`

Un fork public récent (`joomengine/php-wasm-int64`) existe, mais **ne contient pas** le commit exact indiqué ci-dessus ; le substituer sans revue et recompilation serait incorrect.

Si cette archive est définitivement perdue, il faudra remplacer indépendamment les adaptations natives de la couche PHP, ou obtenir les sources exactes et les permissions de leurs auteurs. Une autorisation GPLv2 explicite pour des portions Apache-2.0 effectivement incorporées au même binaire serait l'autre solution.

## Recherche des sauvegardes (10 novembre)

- Les sauvegardes accessibles au compte SSH `mcp-agent`, le dépôt ALWIS et sa copie de travail, et les ZIP disponibles ont été inspectés par `scripts/recover-php-wasm-source.py`. Aucune archive correspondant au SHA-256 verrouillé n'a été trouvée.
- La sauvegarde du build GitHub Actions 41212524552 (`baseline-php-8.4`) a été téléchargée pour inspection : elle contient le WASM, la glue JS, les notices et les journaux, **pas** `native/runtime.c` ou l'arbre source complet du fork.
- Software Heritage et Wayback n'ont pas fourni le commit exact. Un fork du même organisme, `joomengine/php-wasm-int64`, existe mais ne contient pas cet ancien commit et n'est pas une source de remplacement compatible par simple substitution.
- **Accès manquant :** les sauvegardes CloudPanel téléchargées sur le PC ne sont pas montées ici ; l'accès aux répertoires système ou privés de la machine SSH nécessite une autorisation distincte (`sudo -n` n'est pas disponible).
- Repli vérifié : `seanmorris/php-wasm@1e1fb6703730759181e84c62bce35ee9129febb9` (GPLv2 en option pour le code couvert). Son API `pib_run` ne remplace pas `php_wasm_run`. Son patch PHP 8.4 ne s'applique pas tel quel au PHP 8.4.27 attendu : des adaptations Zend et tokenizer sont nécessaires.
- Reçu reproductible : [`php-wasm-source-recovery.json`](php-wasm-source-recovery.json).

## Pour une vraie release

1. Retrouver/réimplémenter l'adaptateur PHP manquant et confirmer ses licences, puis préparer le commit MariaDB propre avec `scripts/prepare-native-concurrency.py`.
2. Recompiler PHP+MariaDB avec Emscripten 6.0.6 sur un environnement **Linux x86-64** à outils natifs compatibles.
3. Lancer les tests réels Chromium/Firefox avec le **nouveau** hash WASM (transactions, PDO/MySQLi, checkpoints, reprise et persistance).
4. Produire les archives de sources et leur reçu : `scripts/package-native-sources.py --strict`. Reconstituer la nomenclature native réelle, y compris ses exceptions par fichier.
5. Générer `artifact.json` avec `scripts/manifest-native-build.py` ; celui-ci rejette expressément l'ancien hash WASM et les sources non fournies.
6. Faire valider le périmètre et les permissions des contributions reprises, confirmer les notices et **seulement alors** lever les blocages du fichier `release-licensing-status.json`.
7. Publier le runtime natif puis le FTP et l'image GHCR à partir du même artefact vérifié.

**Il ne faut pas corriger ce problème en changeant seulement `status:blocked` en `ready`, ni en supprimant les preuves du patch tiers de l'historique.**

## Décisions à confirmer avec le propriétaire du dépôt

- **Source manquante :** as-tu une copie de l'ancien fork JoomEngine PHP-WASM ou un backup de la première compilation native ? Sinon, acceptes-tu de contacter ses auteurs pour demander le commit/les droits exacts ?
- **Titularité :** confirmes-tu que les parties ALWIS mises sous PolyForm sont bien tes créations ou que tu possèdes les droits nécessaires, notamment pour tout code créé en collaboration ?
- **Mode de distribution :** si une composante de ton code doit être mise sous GPLv2 pour être distribuée avec MariaDB, confirmes-tu que l'objectif de publier prime sur sa restriction commerciale ? Les parties indépendantes peuvent conserver leur licence actuelle sous réserve de la frontière technique et juridique.

Ce document ne prétend pas qu'une consultation juridique soit une étape technique obligatoire dans tous les cas ; elle est recommandée pour trancher les frontières et droits d’auteur incertains avant de déclarer une redistribution « sans problème de licence ».
