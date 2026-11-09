# Audit de redistribution — ALWIS

**Situation au 9 novembre 2026 : publication bloquée.** Ce rapport rassemble les contraintes vérifiées ; il ne tient pas lieu d'avis juridique.

## Les licences déjà définies

- **Code original web/serveur indépendant :** PolyForm Noncommercial 1.0.0, seulement dans le périmètre explicite de [LICENSE.md](../LICENSE.md). Attribution par la ligne `Required Notice:` de [NOTICE.md](../NOTICE.md).
- **Documentation originale :** CC BY-NC-SA 4.0 (attribution, indication des modifications, non commercial, partage à l'identique).
- **MariaDB Server :** GPL-2.0-only. La GPL autorise la vente et l'usage commercial ; une clause NC ne peut pas lui être imposée.
- **PHP, wolfSSL, Connector/C, TypeScript/SWC et autres dépendances :** leurs conditions propres, y compris les exceptions applicables, restent inchangées.

Les licences séparées des fichiers originaux **ne constituent pas une licence globale du paquet ALWIS**. Il reste à examiner si les composants livrés peuvent juridiquement être distribués indépendamment ou constituent une œuvre combinée.

## Pourquoi la release est bloquée

1. **Ancien patch de sessions :** le binaire natif encore épinglé a été créé avec un patch issu de `joomengine/mariadb-wasm-bridge` (Apache-2.0), intégré à MariaDB GPLv2. Ces licences sont incompatibles pour une incorporation dans une œuvre GPLv2. Un adaptateur ALWIS de remplacement a été préparé et testé structurellement, **mais pas encore recompilé, testé en navigateur ni approuvé juridiquement**. [Analyse technique](../engine/patches/INDEPENDENT-SESSION-MIGRATION.md).
2. **Inventaire natif incomplet :** vérifier les bibliothèques réellement liées, les exceptions par fichier PHP, les gitlinks et les changements natifs.
3. **Frontière de l'éditeur :** analyser la distribution des composants Apache-2.0 TypeScript/SWC avec le binaire GPL.
4. **Provenance :** compléter `source-map.csv` et `reuse-ledger.csv` après comparaison des éventuelles reprises de code (DrawDB, ChartDB, Outerbase, etc.).
5. **Preuves de publication :** fournir, pour chaque artefact exact, les sources correspondantes, tous les textes de licence, les notices, les empreintes et la recette de reconstruction.

Le fichier [release-licensing-status.json](release-licensing-status.json) fait foi pour les actions de publication. **Ne pas le modifier en `ready` tant que ces points ne sont pas vérifiés.**

## Comment parvenir à une nouvelle release

1. Recompiler le runtime **sans le patch Apache historique**, sur le commit MariaDB épinglé ; conserver les reçus du nouvel adaptateur.
2. Exécuter les tests réels de charge InnoDB, transactions, persistance, sessions et redémarrage dans Chromium et Firefox.
3. Établir les licences du code exact de ce binaire : MariaDB, PHP License v4 là où autorisé et exceptions fichier par fichier, wolfSSL, Connector/C et autres éléments liés.
4. Vérifier tous les apports repris et les frontières entre composants GPL et non-GPL.
5. Construire une nouvelle distribution avec manifestes SHA-256, licences et notices vérifiées ; réévaluer chaque bloqueur avant toute mise en ligne.

## Liens de référence

- [FAQ de licences MariaDB](https://mariadb.com/docs/general-resources/community/community/faq/licensing-questions/licensing-faq)
- [Licences PHP et choix de version](https://www.php.net/license/)
- [Exception wolfSSL dans MariaDB](https://github.com/wolfSSL/wolfssl/blob/1d363f3adceba9d1478230ede476a37b0dcdef24/LICENSING)
- [Compatibilité Apache 2.0 / GPL](https://www.apache.org/licenses/GPL-compatibility)
- [FAQ GPLv2 (FSF)](https://www.gnu.org/licenses/old-licenses/gpl-2.0-faq.en.html)
- [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)
- [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

**Remarque sur les anciennes publications :** les releases et images déjà diffusées ne deviennent pas conformes du seul fait de modifier `LICENSE.md`. La suppression d'un fichier du dépôt courant ne supprime ni les copies déjà reçues ni les obligations de licence applicables.
