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

## Le blocage historique et la reconstruction indépendante

La recette historique par défaut utilise encore `build-work/php/native/runtime.c`, provenant de `joomengine/php-wasm@3b8cef42c020fbcbb6b41fad86716b7c8664b55b`. Ce dépôt est indisponible et son archive exacte n'est pas présente. **Ne pas reconstruire ni redistribuer cette variante historique à partir de sources substituées.**

Le chemin de génération désormais unique de `scripts/prepare-native-drivers.py`, invoqué par `scripts/build-independent-native.sh`, utilise `packages/php-native/src/runner.c` original d'ALWIS. La recette historique est archivée et ne peut plus être activée accidentellement. Ce source est présent, générable et testé au niveau de ses contrats C, mais **n'est toujours pas lié ni testé comme runtime PHP/MariaDB WASM**.

Archive historique recherchée à des fins de provenance (non nécessaire à la voie indépendante) :

- Nom attendu : `joomengine--php-wasm-3b8cef42c020fbcbb6b41fad86716b7c8664b55b.tar.gz`
- SHA-256 : `d30679568282f94ede723c5313ba2664380ede421cfb27693dcc9bc9fe9a533c`
- Emplacement de travail conseillé : `build-work/source-archives/` (non versionné)
- Vérification d'archive historique : comparer l'empreinte au `provenance/upstream-lock.json` ; **la commande de sources correspondantes du nouveau candidat n'exige plus cette archive**.

Un fork public récent (`joomengine/php-wasm-int64`) existe, mais **ne contient pas** le commit exact indiqué ci-dessus ; le substituer sans revue et recompilation serait incorrect.

Le candidat de remplacement du runner est écrit dans le dépôt. Pour l'utiliser, il reste à finaliser la compilation Emscripten et la parité comportementale, puis à documenter l'ensemble des sources effectivement liées. Si une partie originale de JoomEngine était malgré tout incorporée à un nouveau binaire, une revue de ses droits resterait indispensable : l'option GPLv2 des fichiers Sean Morris ne s'étend pas automatiquement à ces ajouts.

## Recherche des sauvegardes (10 novembre)

- Les sauvegardes accessibles au compte SSH `mcp-agent`, le dépôt ALWIS et sa copie de travail, et les ZIP disponibles ont été inspectés par `scripts/recover-php-wasm-source.py`. Aucune archive correspondant au SHA-256 verrouillé n'a été trouvée.
- La sauvegarde du build GitHub Actions 41212524552 (`baseline-php-8.4`) a été téléchargée pour inspection : elle contient le WASM, la glue JS, les notices et les journaux, **pas** `native/runtime.c` ou l'arbre source complet du fork.
- Software Heritage et Wayback n'ont pas fourni le commit exact. Un fork du même organisme, `joomengine/php-wasm-int64`, existe mais ne contient pas cet ancien commit et n'est pas une source de remplacement compatible par simple substitution.
- **Accès manquant :** les sauvegardes CloudPanel téléchargées sur le PC ne sont pas montées ici ; l'accès aux répertoires système ou privés de la machine SSH nécessite une autorisation distincte (`sudo -n` n'est pas disponible).
- Repli vérifié : `seanmorris/php-wasm@1e1fb6703730759181e84c62bce35ee9129febb9` (GPLv2 en option pour le code couvert). Son API `pib_run` ne remplace pas `php_wasm_run`. Son patch PHP 8.4 ne s'applique pas tel quel au PHP 8.4.27 attendu : des adaptations Zend et tokenizer sont nécessaires.
- Reçu reproductible : [`php-wasm-source-recovery.json`](php-wasm-source-recovery.json).

## Pour une vraie release

1. Revoir puis compiler l'adaptateur ALWIS `packages/php-native/src/runner.c`, déjà préparé sous option explicite ; produire la copie MariaDB propre avec `scripts/prepare-native-concurrency.py`.
2. Recompiler PHP+MariaDB avec Emscripten 6.0.6 sur un environnement **Linux x86-64** à outils natifs compatibles.
3. Lancer les tests réels Chromium/Firefox avec le **nouveau** hash WASM (transactions, PDO/MySQLi, checkpoints, reprise et persistance).
4. Produire le paquet de sources correspondantes et son reçu : `scripts/package-native-sources.py --strict`. Il comprend les cinq archives amont requises **sans l'ancien fork JoomEngine non lié**, l'implémentation originale ALWIS, les modifications MariaDB et les **fichiers C générés** dont les SHA-256 sont vérifiés par `scripts/native_runner_provenance.py`. Le script refuse une source générée différente du runner du dépôt. Vérifier la nomenclature native réelle et ses exceptions de licence.
5. Générer `artifact.json` avec `scripts/manifest-native-build.py` ; celui-ci rejette expressément l'ancien hash WASM et les sources non fournies.
6. Faire valider le périmètre et les permissions des contributions reprises, confirmer les notices et **seulement alors** lever les blocages du fichier `release-licensing-status.json`.
7. Publier le runtime natif puis le FTP et l'image GHCR à partir du même artefact vérifié.

**Il ne faut pas corriger ce problème en changeant seulement `status:blocked` en `ready`, ni en supprimant les preuves du patch tiers de l'historique.**

## Décisions à confirmer avec le propriétaire du dépôt

- **Source manquante :** as-tu une copie de l'ancien fork JoomEngine PHP-WASM ou un backup de la première compilation native ? Sinon, acceptes-tu de contacter ses auteurs pour demander le commit/les droits exacts ?
- **Titularité :** confirmes-tu que les parties ALWIS mises sous PolyForm sont bien tes créations ou que tu possèdes les droits nécessaires, notamment pour tout code créé en collaboration ?
- **Mode de distribution :** si une composante de ton code doit être mise sous GPLv2 pour être distribuée avec MariaDB, confirmes-tu que l'objectif de publier prime sur sa restriction commerciale ? Les parties indépendantes peuvent conserver leur licence actuelle sous réserve de la frontière technique et juridique.

Ce document ne prétend pas qu'une consultation juridique soit une étape technique obligatoire dans tous les cas ; elle est recommandée pour trancher les frontières et droits d’auteur incertains avant de déclarer une redistribution « sans problème de licence ».
