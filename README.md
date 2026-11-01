# WASMWebServer

Environnement PHP + MariaDB dans le navigateur pour les petits projets web. Un module principal WASM, pont C commun à PDO/MySQLi, fichiers persistants, N fenêtres clientes et sessions indépendantes ou partagées.

Le prototype fonctionne dans Chromium et Firefox. Le [cadrage actif](docs/EXECUTION.md) distingue les fonctions validées des limites de compatibilité et de mémoire.

## Fonctionnalités actuelles

- PHP 8.4.27 : formulaires, sessions, uploads, fichiers et HTTP navigateur ; filter, ctype, tokenizer, fileinfo, mbstring et iconv.
- [MySQLi : 106 fonctions enregistrées](engine/fusion/MYSQLI-106-RECEIPT.md), avec six API hors contexte refusées explicitement. PDO/MySQLi natifs, préparations, types exacts, transactions et résultats multiples sous quotas.
- [Éditeur CodeMirror 6](apps/studio/editor/README.md) : fichiers, arborescence, recherche/remplacement, brouillons, PHP LSP en Rust/WASM, SuperHTML, SWC et définitions jQuery internes. Aucun interpréteur PHP supplémentaire pour la complétion.
- SQL : console avec scripts et résultats multiples, catalogue réel pour la complétion, grille paginée, insertion/modification/suppression, schéma et import/export.
- Sauvegarde et reprise du projet dans le navigateur, contrôle des propriétaires, quotas et journal local borné.

La compatibilité exhaustive PDO/MySQLi, ZIP/XML côté PHP, les diagnostics PHP sémantiques complets, les formulaires DDL avancés et l'endurance restent à compléter. La capacité linéaire WASM n'est pas la RAM totale du navigateur. Voir [les étapes restantes](docs/PROCHAINES-ETAPES.md) et [les profils mesurés](docs/PROFILS-PERFORMANCE.md).

## Démarrer

Node 24 et Python 3.12+, puis le [build natif](engine/fusion/spike/README.md) ou la restauration du module validé pour la publication.

```sh
npm ci
npm run editor:build
npm test
node scripts/serve-studio.mjs
```

Ouvrir un projet vide, charger l'exemple scolaire et ouvrir une fenêtre cliente. Le [guide du studio](apps/studio/README.md) explique les sessions, les fichiers et la sauvegarde.

## Publier

Le [dernier essai](docs/PUBLICATION-FTP.md) a validé le build sur les deux navigateurs ; l’envoi attend le secret GitHub FTP_PASSWORD. Le [workflow FTP](docs/FTP-DEPLOYMENT.md) construit et vérifie le site statique avant publication. Il se lance manuellement dans GitHub Actions et utilise le secret FTP_PASSWORD. Le module natif validé est conservé séparément sur `studio-native-runtime`, avec ses empreintes ; il ne mélange pas les fichiers des projets avec le site publié.

Le paquet autonome se prépare avec `node scripts/package-studio.mjs`. HTTPS et les en-têtes COOP/COEP sont nécessaires à PHP/MariaDB. Les projets restent dans le stockage du navigateur ; ils ne sont pas envoyés sur FTP.

## Documentation et provenance

L'[index de documentation](docs/INDEX.md) donne les guides actuels et identifie les rapports historiques. Les sources amont épinglées, leurs licences et leurs empreintes restent dans `provenance/`. L'unique release `sources-2026-10-31` est conservée : ses 19 archives vérifiées sont utilisées pour restaurer les sources et dépassent les limites des fichiers Git.

Les dossiers `build-work/`, `sources/`, `upstream/` et les dépendances npm sont générés ou restaurés localement. Ils ne font pas partie du code source de l'application.
