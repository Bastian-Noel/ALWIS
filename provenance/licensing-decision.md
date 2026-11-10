# Audit de redistribution — ALWIS

**Correction du 11 novembre 2026 :** la [notice du commit historique](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/patches/NOTICE) place explicitement le patch moteur et le glue modifié sous GPL-2.0-only. Leur attribution précédente à Apache-2.0 était erronée : la licence racine du dépôt ne remplace pas cette notice spécifique. Le moteur ALWIS indépendant reste retenu pour sa reconstruction vérifiable.

**Situation au 11 novembre 2026 : vérification du paquet de publication en cours.** Ce rapport rassemble les contraintes vérifiées ; il ne tient pas lieu d'avis juridique.

## Les licences déjà définies

- **Code original web/serveur indépendant :** GPL-2.0-only, avec exception MIT pour le code original de `apps/studio/editor/`, suivant [LICENSE.md](../LICENSE.md). Attribution par la ligne `Required Notice:` de [NOTICE.md](../NOTICE.md).
- **Documentation originale :** CC BY-NC-SA 4.0 (attribution, indication des modifications, non commercial, partage à l'identique).
- **MariaDB Server :** GPL-2.0-only. La GPL autorise la vente et l'usage commercial ; une clause NC ne peut pas lui être imposée.
- **PHP, wolfSSL, Connector/C, TypeScript/SWC et autres dépendances :** leurs conditions propres, y compris les exceptions applicables, restent inchangées.

Les licences séparées des fichiers originaux **ne constituent pas une licence globale du paquet ALWIS**. Il reste à examiner si les composants livrés peuvent juridiquement être distribués indépendamment ou constituent une œuvre combinée.

## Pourquoi la release est bloquée

1. **Ancien patch de sessions :** le grief Apache-2.0/GPLv2 est retiré après vérification de la notice spécifique. Le nouveau runtime indépendant compile et passe les tests natifs en navigateur ; sa distribution finale doit encore être vérifiée.
2. **Inventaire natif incomplet :** vérifier les bibliothèques réellement liées, les exceptions par fichier PHP, les gitlinks et les changements natifs.
3. **Frontière de l'éditeur :** analyser la distribution des composants Apache-2.0 TypeScript/SWC avec le binaire GPL.
4. **Provenance :** compléter `source-map.csv` et `reuse-ledger.csv` après comparaison des éventuelles reprises de code (DrawDB, ChartDB, Outerbase, etc.).
5. **Preuves de publication :** fournir, pour chaque artefact exact, les sources correspondantes, tous les textes de licence, les notices, les empreintes et la recette de reconstruction.

Le fichier [release-licensing-status.json](release-licensing-status.json) fait foi pour les actions de publication. **Ne pas le modifier en `ready` tant que ces points ne sont pas vérifiés.**

## Comment parvenir à une nouvelle release

1. Recompiler le runtime avec les adaptations ALWIS documentées, sur le commit MariaDB épinglé ; conserver les reçus du nouvel adaptateur.
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
