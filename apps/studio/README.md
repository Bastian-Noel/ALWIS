# ALWIS : interface de l’atelier

`index.html` est la coque principale. `workbench/main.mjs` branche les vues de l’interface sur les services réels ; aucun moteur simulé n’est livré.

- `workbench/services.mjs` appelle ProjectHub, NativeRuntime, les sessions et le stockage existants.
- `workbench/views/` : code, explorateur, données, structure, schéma, sessions et panneau Serveur.
- `workbench/ui.mjs` : dialogues, menus et montage de notre CodeMirror.
- `database/` : valeurs SQL sans perte, analyse des définitions de colonnes, modèle relationnel, scripts et export PHP.
- `editor/` : bundles et services de langage existants, sans nouvel interpréteur PHP.
- `project-hub.mjs`, `service-worker.mjs`, `client-bootstrap.js` : propriétaire du moteur et requêtes clientes.

Les URL publiques du studio, du Service Worker et des clients restent compatibles. Les clés de stockage des anciens projets sont conservées. La reprise des brouillons de l’ancien éditeur est prise en charge. Le format ZIP historique reste importable.

```sh
node scripts/serve-studio.mjs
node tests/browser/alwis-workbench.mjs
node tests/browser/alwis-accessibility.mjs
```

Voir [CONTRIBUTING](../../CONTRIBUTING.md) pour la préparation des moteurs et navigateurs. Les captures et reçus de cette interface sont sous `receipts/alwis/`. Les anciens reçus décrivent les révisions historiques, pas l’interface courante.
