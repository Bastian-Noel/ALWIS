# Moteurs natifs

Le produit cible est un WASM unique PHP + MariaDB avec pont natif et SQL initialisé à la demande. La compilation séparée sert de témoin mesurable.

- `baseline/` : recettes de reproduction des versions amont, sans patch WASMWebServer.
- `patches/` : futurs patchs du produit, séparés des snapshots d'origine.
- Les checkouts et compilations sont placés dans `build-work/`, ignoré par Git.
- Les binaires et logs CI sont conservés comme artifacts ; les manifestes et conclusions restent versionnés.

Ne pas confondre compiler le pilote PDO chargeable du bridge et compiler PHP lui-même. Les témoins doivent apporter ces deux preuves séparément.
