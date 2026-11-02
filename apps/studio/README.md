# Studio : points d’entrée techniques

`index.html` définit la coque et les modèles DOM. `studio.mjs` orchestre les outils et le cycle du projet ; `service-worker.mjs` route les requêtes clientes vers le propriétaire moteur. `database/` regroupe les modèles SQL, DDL, valeurs et schéma ; `editor/` fournit CodeMirror et les services de langage.

Les URL publiques de l’entrée, du Service Worker et des workers d’édition sont conservées. `scripts/package-studio.mjs` assemble les modules SQL et les bundles d’édition ; `scripts/serve-studio.mjs` sert les sources et associe sql-export.source.txt à database/sql-export.php. Ne pas servir ce dernier comme un backend PHP distant.

Pour travailler sur cette application :

```sh
node scripts/serve-studio.mjs
node tests/browser/editor-workbench.mjs
node tests/browser/ide-workspace.mjs
node tests/browser/studio-shell.mjs chromium
```

La préparation du moteur et de Playwright est décrite dans [CONTRIBUTING](../../CONTRIBUTING.md). Le [guide utilisateur](../../docs/README.md) porte les procédures fonctionnelles ; [architecture](../../docs/architecture.md) porte le stockage et les responsabilités. Les reçus locaux sont sous receipts/ et build-work/ ; ils sont liés à la révision testée.
