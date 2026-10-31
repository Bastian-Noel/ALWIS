# Références GitHub retenues

Sources téléchargées le 31 octobre 2026. Les archives complètes préservent les notices ; aucune dépendance npm ni chaîne de compilation native n’a été installée.

| Dépôt / commit | Rôle | Éléments utiles | Limites / travail |
|---|---|---|---|---|
| [seanmorris/php-wasm](https://github.com/seanmorris/php-wasm/tree/1e1fb6703730759181e84c62bce35ee9129febb9) · `1e1fb6703730` | Runtime principal étudié | CGI, commandes, synchronisation incrémentale, extensions | À déplacer derrière le studio ; pas moteur dans SW |
| [joomengine/php-wasm](https://github.com/joomengine/php-wasm/tree/3b8cef42c020fbcbb6b41fad86716b7c8664b55b) · `3b8cef42c020` | Alternative de runtime | API HTTP et pilote PDO compilé | Autre épinglage du bridge ; ne pas combiner les versions sans tests |
| [joomengine/mariadb-wasm-bridge](https://github.com/joomengine/mariadb-wasm-bridge/tree/56d47b4dc867af313592efa09e12df470a36e129) · `56d47b4dc867` | Socle PDO et sessions SQL | Pilote C, hostcall, tests types/transactions, patch de sessions | JSON/base64, préparations émulées et reset global à adapter |
| [shyim/lite4mariadb](https://github.com/shyim/lite4mariadb/tree/24be9371a2f6c71250a2356631ad6feab2280b02) · `24be9371a2f6` | Moteur MariaDB embarqué | libmariadbd, InnoDB, CMake, API C/JS et Worker | IDBFS en mémoire, résultats bufferisés, profil 256 Mio/16 threads |
| [WordPress/wordpress-playground](https://github.com/WordPress/wordpress-playground/tree/a4dbcd0bf65a82e10a5d3821f5023aeee81097e6) · `a4dbcd0bf65a` | Architecture HTTP navigateur | SW, scopes, cookies, orchestration et request handler | Adapter partage entre fenêtres ; ne pas embarquer WordPress pour le socle |
| [php/php-src](https://github.com/php/php-src/tree/7ba31bb1934ae22c2d007135e89a38af131ec52e) · `7ba31bb1934a` | Contrats natifs PHP | MySQLi/mysqlnd/PDO et tests | HEAD est une référence de lecture, pas la version PHP à compiler pour le témoin |
| [emscripten-core/emscripten](https://github.com/emscripten-core/emscripten/tree/91d14a4c6729752ed146751416fe96598cac3dc7) · `91d14a4c6729` | VFS natif | WasmFS et backend OPFS C++/JS | HEAD de lecture ; bridge construit avec 6.0.6, intégration à revalider |
| [zen-fs/core](https://github.com/zen-fs/core/tree/ecb25b1bfd81879ef79052156c0171f215117b59) · `ecb25b1bfd81` | Comparaison de VFS | Interfaces et mixin Async | Inspecter préchargement/caches avant de choisir |
| [zen-fs/dom](https://github.com/zen-fs/dom/tree/d9d9288471c7825a5ead485440aa87dec3c38ee2) · `d9d9288471c7` | Comparaison de stockage navigateur | FileSystem handles et IndexedDB | WebAccessFS et accès OPFS natif ne sont pas interchangeables |
| [zen-fs/emscripten](https://github.com/zen-fs/emscripten/tree/c9d5c47d0a420e0fa05d635d106457bf56c17dc0) · `c9d5c47d0a42` | Adaptateur VFS | Montage dans les deux sens | Choisir un seul sens et éviter doubles copies |
| [kachurun/opfs-worker](https://github.com/kachurun/opfs-worker/tree/c8813394795bcb26a0030ea94697114c59ec5b7e) · `c8813394795b` | Référence opérations fichiers | Descripteurs, sync handles, streaming et notifications | readFile alloue tout ; privilégier des blocs pour gros fichiers |
| [GoogleChromeLabs/comlink](https://github.com/GoogleChromeLabs/comlink/tree/114a4a6448a855a613f1cb9a7c89290606c003cf) · `114a4a6448a8` | Alternative de RPC | expose, transfer, libération des proxies | Ne pas empiler les bus ni passer des pointeurs WASM |
| [drawdb-io/drawdb](https://github.com/drawdb-io/drawdb/tree/dc32c8bde614c931ec8bf3b3c346500d7626ab72) · `dc32c8bde614` | Inspiration éditeur relationnel | Tables, colonnes, relations et introspection MariaDB | Interface à relier à la vraie DB et au DDL |
| [chartdb/chartdb](https://github.com/chartdb/chartdb/tree/57bca690cc180f7501c6aa0c163c3b1dd418efa7) · `57bca690cc18` | Inspiration introspection/diagramme | Métadonnées MySQL et rendu des tables/relations | Comparer les petits éléments utiles, ne pas importer toute application |
| [outerbase/studio](https://github.com/outerbase/studio/tree/70c9d8e9745c161fb84746d3372bdab838c9bb36) · `70c9d8e9745c` | Inspiration console et grille | Pipeline de requêtes, résultats et générateur de schéma | Brancher au backend local et borner pages/historique |
| [xyflow/xyflow](https://github.com/xyflow/xyflow/tree/d4bc936edad07aba995dbdb8e2c63af8cdd631c9) · `d4bc936edad0` | Interactions du schéma | Nœuds, handles, arêtes, drag/zoom | Aucune validation SQL automatique |
| [codemirror/lang-sql](https://github.com/codemirror/lang-sql/tree/f5b0b0ba1811f87db2d1733f005585bd43322980) · `f5b0b0ba1811` | Éditeur SQL | Dialecte MariaSQL et complétion | Snapshot GitHub conservé ; le dépôt indique un nouvel hébergement |

La cartographie [CODE-MAP.md](CODE-MAP.md) descend jusqu’aux chemins, repères de lignes et intentions d’adaptation. `provenance/source-map.json` contient aussi les SHA-256 des fichiers.

## Sous-modules MariaDB

| Dépendance | Commit | État |
|---|---|---|
| [libmariadb](https://github.com/MariaDB/mariadb-connector-c/tree/5a6fe6016fc908518e7d2a8c128a5c108b511c17) | `5a6fe6016fc908518e7d2a8c128a5c108b511c17` | Archive téléchargée et vérifiée |
| [storage/rocksdb/rocksdb](https://github.com/facebook/rocksdb/tree/79f08d7ffa6d34d9ca3357777bcb335884a56cfb) | `79f08d7ffa6d34d9ca3357777bcb335884a56cfb` | Inventorié, module optionnel non téléchargé pour le profil réduit |
| [wsrep-lib](https://github.com/mariadb-corporation/wsrep-lib/tree/5eeef4009d52455c44b607e852cb23fbb6e84c99) | `5eeef4009d52455c44b607e852cb23fbb6e84c99` | Inventorié, module optionnel non téléchargé pour le profil réduit |
| [extra/wolfssl/wolfssl](https://github.com/wolfSSL/wolfssl/tree/1d363f3adceba9d1478230ede476a37b0dcdef24) | `1d363f3adceba9d1478230ede476a37b0dcdef24` | Archive téléchargée et vérifiée |
| [storage/maria/libmarias3](https://github.com/mariadb-corporation/libmarias3/tree/23873f4acb8038d8cccc5f0bc61c45ac07727f73) | `23873f4acb8038d8cccc5f0bc61c45ac07727f73` | Inventorié, module optionnel non téléchargé pour le profil réduit |
| [storage/columnstore/columnstore](https://github.com/mariadb-corporation/mariadb-columnstore-engine/tree/962e861c6a11e375cd95c78a517ab2b5d50e0076) | `962e861c6a11e375cd95c78a517ab2b5d50e0076` | Inventorié, module optionnel non téléchargé pour le profil réduit |
| [storage/duckdb/third_parties/duckdb](https://github.com/duckdb/duckdb/tree/8a5851971fae891f292c2714d86046ee018e9737) | `8a5851971fae891f292c2714d86046ee018e9737` | Inventorié, module optionnel non téléchargé pour le profil réduit |

## Références de spécification vérifiées

- [Emscripten — File System API](https://emscripten.org/docs/api_reference/Filesystem-API.html) : distinction VFS, persistance et WasmFS.
- [WHATWG — File System](https://fs.spec.whatwg.org/) : OPFS et exposition des sync access handles aux Dedicated Workers.
- [PHP RFC — Remove support for libmysql from mysqli](https://wiki.php.net/rfc/mysqli_support_for_libmysql) : depuis PHP 8.2, mysqli se construit avec mysqlnd.

## Pistes non retenues pour le socle

La conversation initiale comparait aussi MySQL/MariaDB sous Wasmtime et MySQL dans v86. Le socle vise un navigateur sans VM x86 ni serveur réseau externe : leurs sources ne sont donc pas incluses dans ce téléchargement ciblé. Leurs performances précédemment citées ne sont pas utilisées comme benchmarks de ce projet.

Boogie n’avait pas été identifié avec certitude dans la conversation source. Aucun dépôt n’est attribué à ce nom dans cette reconstruction.
