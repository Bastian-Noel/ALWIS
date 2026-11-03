# Contribuer

Node 24, Python 3.12+, Git, npm et GitHub CLI authentifié sont nécessaires au développement. Le serveur du ZIP distribué ne demande que Node 20+.

```sh
npm ci
python3 scripts/restore-deployment-engine.py
npm run editor:build
npm test
node scripts/serve-workbench/main.mjs
```

La restauration télécharge un moteur épinglé et vérifie les empreintes et les sources natives. Pour reconstruire : voir [la recette native](engine/native/build/README.md), Emscripten 6.0.6 et les sources épinglées dans provenance/. Les témoins amont restent dans engine/baseline/.

Avant contribution : exécuter les tests unitaires, les parcours navigateur affectés et `node scripts/package-workbench/main.mjs`, puis `node tests/browser/site-package.mjs`. La CI commune décrit les versions exactes et l’installation de Playwright. Les modifications natives exigent une nouvelle compilation et validation, puis une nouvelle distribution technique ; ne pas modifier les empreintes pour contourner ce contrôle.

Les tâches restantes sont centralisées dans [le guide](docs/README.md). Les notes des releases constituent l’historique des distributions. Une validation locale ne garantit pas l’état d’une release publiée.

Aucune licence globale du projet n’a été choisie ici. Préserver les licences des composants amont et THIRD-PARTY.txt généré. Les dossiers build-work/, sources/, upstream/ et node_modules/ sont restaurés ou générés et restent hors Git.
