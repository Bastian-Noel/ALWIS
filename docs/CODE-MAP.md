# Cartographie du code amont

81 points vérifiés sur 17 dépôts. Les liens épinglent les commits, les empreintes vérifient les fichiers entiers.

Les lignes sont des repères de lecture, pas des plages à copier aveuglément. Les destinations marquées « à créer » ne sont pas implémentées.

## seanmorris/php-wasm

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-001 | [source/PhpCgiBase.mjs:818](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/source/PhpCgiBase.mjs#L818) — `async request(request)` | CGI et cycle HTTP ; sortir les moteurs du Service Worker | packages/runtime/adapters/seanmorris (à créer) |
| SRC-002 | [source/PhpCgiBase.mjs:863](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/source/PhpCgiBase.mjs#L863) — `async _request(request, php)` | Construire les variables CGI et préserver POST/cookies/en-têtes | packages/runtime/adapters/seanmorris (à créer) |
| SRC-003 | [source/PhpCgiBase.mjs:513](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/source/PhpCgiBase.mjs#L513) — `handleMessageEvent(event)` | Réutiliser le protocole de commandes plutôt que doubler les bus | packages/runtime/adapters/seanmorris (à créer) |
| SRC-004 | [source/PhpCgiBase.mjs:642](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/source/PhpCgiBase.mjs#L642) — `async _enqueue(` | Comparer la file existante à notre admission bornée | packages/runtime/adapters/seanmorris (à créer) |
| SRC-005 | [source/PhpCgiBase.mjs:810](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/source/PhpCgiBase.mjs#L810) — `async _afterRequest(` | Point de persistance et de nettoyage par requête | packages/runtime/adapters/seanmorris (à créer) |
| SRC-006 | [source/fsOps.mjs:67](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/source/fsOps.mjs#L67) — `static async readFile` | Interface de lecture de fichiers à remplacer par OPFS/cache borné | packages/runtime/adapters/seanmorris (à créer) |
| SRC-007 | [source/fsOps.mjs:139](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/source/fsOps.mjs#L139) — `static async writeFile` | Écriture, invalidation et barrière avant requête suivante | packages/runtime/adapters/seanmorris (à créer) |
| SRC-008 | [source/idbfsSync.mjs:185](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/source/idbfsSync.mjs#L185) — `async function flush` | Journal incrémental : conserver les mutations après erreur/quota | packages/runtime/adapters/seanmorris (à créer) |
| SRC-009 | [source/idbfsSync.mjs:299](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/source/idbfsSync.mjs#L299) — `backend.syncfs =` | Comparer persistance incrémentale et backend OPFS | packages/runtime/adapters/seanmorris (à créer) |
| SRC-010 | [source/parseResponse.mjs:1](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/source/parseResponse.mjs#L1) — `export` | Parsing des réponses CGI ; vérifier en-têtes répétés et binaire | packages/runtime/adapters/seanmorris (à créer) |
| SRC-011 | [test/perf/wasmfs-opfs/README.md:1](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/test/perf/wasmfs-opfs/README.md#L1) — `#` | Réutiliser la méthode comparative OPFS/IDBFS, pas les chiffres comme promesse | packages/runtime/adapters/seanmorris (à créer) |
| SRC-012 | [test/perf/wasmfs-opfs/results/2026-09-20-incremental-idbfs/README.md:11](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/test/perf/wasmfs-opfs/results/2026-09-20-incremental-idbfs/README.md#L11) — `## Results` | Résultats amont : IDBFS incrémental peut concurrencer OPFS | packages/runtime/adapters/seanmorris (à créer) |
| SRC-013 | [php.mk:1](https://github.com/seanmorris/php-wasm/blob/1e1fb6703730759181e84c62bce35ee9129febb9/php.mk#L1) — `include` | Entrée des recettes de compilation ; suivre les includes pour le profil PHP | packages/runtime/adapters/seanmorris (à créer) |
## joomengine/mariadb-wasm-bridge

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-014 | [native/pdo_mariadb_wasm.c:133](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/native/pdo_mariadb_wasm.c#L133) — `static bool wm_call(` | Remplacer sérialisation JSON et hostcall par API native commune | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-015 | [native/pdo_mariadb_wasm.c:225](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/native/pdo_mariadb_wasm.c#L225) — `php_base64_decode_ex` | Supprimer décodage base64 dans le transport cible | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-016 | [native/pdo_mariadb_wasm.c:274](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/native/pdo_mariadb_wasm.c#L274) — `static bool wm_prepare(` | Conserver le contrat PDO ; distinguer préparations émulées et natives | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-017 | [native/pdo_mariadb_wasm.c:454](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/native/pdo_mariadb_wasm.c#L454) — `static int wm_statement_column(` | Respecter types, NULL et durée de vie des zval | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-018 | [native/pdo_mariadb_wasm.c:523](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/native/pdo_mariadb_wasm.c#L523) — `static int wm_factory(` | DSN mysql, charset, connexion et erreurs PDO | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-019 | [native/pdo_mariadb_wasm.c:584](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/native/pdo_mariadb_wasm.c#L584) — `PDO_DRIVER_HEADER(mysql)` | Éviter le double enregistrement de pdo_mysql et du pilote adapté | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-020 | [src/protocol.mjs:76](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/src/protocol.mjs#L76) — `async query(payload)` | Mesurer les requêtes auxiliaires SET NAMES/sql_mode/statut | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-021 | [src/protocol.mjs:123](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/src/protocol.mjs#L123) — `function encodeCell` | Remplacer les copies de cellules/base64 par buffers typés | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-022 | [src/protocol.mjs:115](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/src/protocol.mjs#L115) — `async reset()` | Changer reset global en nettoyage limité au propriétaire PHP | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-023 | [src/engine.mjs:86](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/src/engine.mjs#L86) — `openSession()` | Sessions MariaDB réelles distinctes pour PDO/MySQLi/console | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-024 | [src/engine.mjs:96](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/src/engine.mjs#L96) — `async flush()` | Checkpoint InnoDB avant sauvegarde IDBFS ; durabilité à vérifier | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-025 | [src/index.mjs:30](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/src/index.mjs#L30) — `maxQueuedBytes:` | Réutiliser validation des limites ; réduire les budgets pour projet scolaire | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-026 | [adapters/php-wasm.mjs:2](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/adapters/php-wasm.mjs#L2) — `createPhpWasmAdapter` | Assembler le hostcall natif avec Sean Morris | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-027 | [patches/engine/independent-sessions.patch:107](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/patches/engine/independent-sessions.patch#L107) — `--innodb-buffer-pool-size=64M` | Garder sessions et corrections de yield, réexaminer pool 64 Mio | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-028 | [native/tests/database-contract.php:1](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/native/tests/database-contract.php#L1) — `<?php` | Porter les tests de conformité avant optimisation du transport | packages/sql-native + adaptateur PDO (à implémenter) |
| SRC-029 | [native/upstream-versions.json:5](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/native/upstream-versions.json#L5) — `"emscriptenVersion"` | Épinglage de compatibilité Sean Morris/PHP/SDK | packages/sql-native + adaptateur PDO (à implémenter) |
## shyim/lite4mariadb

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-030 | [wasm/CMakeLists.txt:70](https://github.com/shyim/lite4mariadb/blob/24be9371a2f6c71250a2356631ad6feab2280b02/wasm/CMakeLists.txt#L70) — `INITIAL_MEMORY=268435456` | 256 Mio initiaux : matrice de réduction, sans promettre la RAM réelle | packages/sql-native/backend + build MariaDB (à créer) |
| SRC-031 | [wasm/CMakeLists.txt:73](https://github.com/shyim/lite4mariadb/blob/24be9371a2f6c71250a2356631ad6feab2280b02/wasm/CMakeLists.txt#L73) — `PTHREAD_POOL_SIZE=16` | 16 pthreads : réduire seulement après test InnoDB/démarrage | packages/sql-native/backend + build MariaDB (à créer) |
| SRC-032 | [wasm/CMakeLists.txt:71](https://github.com/shyim/lite4mariadb/blob/24be9371a2f6c71250a2356631ad6feab2280b02/wasm/CMakeLists.txt#L71) — `MAXIMUM_MEMORY=2147483648` | Plafond 2 Gio et croissance ; vues JS à renouveler après growth | packages/sql-native/backend + build MariaDB (à créer) |
| SRC-033 | [wasm/lite4mariadb.c:212](https://github.com/shyim/lite4mariadb/blob/24be9371a2f6c71250a2356631ad6feab2280b02/wasm/lite4mariadb.c#L212) — `mysql_store_result(m)` | Résultats entièrement bufferisés : un transport par lots seul ne suffit pas | packages/sql-native/backend + build MariaDB (à créer) |
| SRC-034 | [wasm/lite4mariadb.c:335](https://github.com/shyim/lite4mariadb/blob/24be9371a2f6c71250a2356631ad6feab2280b02/wasm/lite4mariadb.c#L335) — `--innodb-buffer-pool-size=16M` | Base amont 16 Mio, comparer au profil JoomEngine 64 Mio | packages/sql-native/backend + build MariaDB (à créer) |
| SRC-035 | [wasm/lite4mariadb.c:412](https://github.com/shyim/lite4mariadb/blob/24be9371a2f6c71250a2356631ad6feab2280b02/wasm/lite4mariadb.c#L412) — `char *l4m_query` | Entrée ABI C actuelle vers JSON ; cible pour curseurs typés | packages/sql-native/backend + build MariaDB (à créer) |
| SRC-036 | [wasm/src/index.mjs:478](https://github.com/shyim/lite4mariadb/blob/24be9371a2f6c71250a2356631ad6feab2280b02/wasm/src/index.mjs#L478) — `mod.FS.mount(mod.FS.filesystems.IDBFS` | Montage IDBFS avec miroir ; prototype OPFS distinct | packages/sql-native/backend + build MariaDB (à créer) |
| SRC-037 | [wasm/src/index.mjs:566](https://github.com/shyim/lite4mariadb/blob/24be9371a2f6c71250a2356631ad6feab2280b02/wasm/src/index.mjs#L566) — `async persist()` | Sauvegarde explicite distincte du COMMIT | packages/sql-native/backend + build MariaDB (à créer) |
| SRC-038 | [wasm/src/worker.mjs:17](https://github.com/shyim/lite4mariadb/blob/24be9371a2f6c71250a2356631ad6feab2280b02/wasm/src/worker.mjs#L17) — `export` | API Worker JS, console SQL sans exécuter PHP | packages/sql-native/backend + build MariaDB (à créer) |
## php/php-src

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-039 | [ext/mysqli/mysqli_nonapi.c:324](https://github.com/php/php-src/blob/7ba31bb1934ae22c2d007135e89a38af131ec52e/ext/mysqli/mysqli_nonapi.c#L324) — `PHP_FUNCTION(mysqli_connect)` | Conserver interface mysqli_connect et connexion objet | packages/sql-native/mysqli (à créer) |
| SRC-040 | [ext/mysqli/mysqli_api.c:122](https://github.com/php/php-src/blob/7ba31bb1934ae22c2d007135e89a38af131ec52e/ext/mysqli/mysqli_api.c#L122) — `PHP_FUNCTION(mysqli_stmt_bind_param)` | Paramètres par référence : lire les valeurs au moment de execute | packages/sql-native/mysqli (à créer) |
| SRC-041 | [ext/mysqli/mysqli_nonapi.c:911](https://github.com/php/php-src/blob/7ba31bb1934ae22c2d007135e89a38af131ec52e/ext/mysqli/mysqli_nonapi.c#L911) — `PHP_FUNCTION(mysqli_stmt_get_result)` | Retour mysqli_result pour prepared statements | packages/sql-native/mysqli (à créer) |
| SRC-042 | [ext/mysqli/mysqli_api.c:404](https://github.com/php/php-src/blob/7ba31bb1934ae22c2d007135e89a38af131ec52e/ext/mysqli/mysqli_api.c#L404) — `PHP_FUNCTION(mysqli_stmt_execute)` | Exécution préparée et gestion des références | packages/sql-native/mysqli (à créer) |
| SRC-043 | [ext/mysqli/mysqli.c:150](https://github.com/php/php-src/blob/7ba31bb1934ae22c2d007135e89a38af131ec52e/ext/mysqli/mysqli.c#L150) — `mysqli_link_free_storage` | Libération des objets et cycle de requête | packages/sql-native/mysqli (à créer) |
| SRC-044 | [ext/mysqlnd/mysqlnd_structs.h:427](https://github.com/php/php-src/blob/7ba31bb1934ae22c2d007135e89a38af131ec52e/ext/mysqlnd/mysqlnd_structs.h#L427) — `func_mysqlnd_conn_data__connect` | Étudier les tables de méthodes ; détourner transport seul serait insuffisant | packages/sql-native/mysqli (à créer) |
| SRC-045 | [ext/mysqlnd/mysqlnd_result.c:17](https://github.com/php/php-src/blob/7ba31bb1934ae22c2d007135e89a38af131ec52e/ext/mysqlnd/mysqlnd_result.c#L17) — `mysqlnd` | Contrat résultats/mysqlnd à reproduire si backend adapté | packages/sql-native/mysqli (à créer) |
| SRC-046 | [ext/pdo/php_pdo_driver.h:407](https://github.com/php/php-src/blob/7ba31bb1934ae22c2d007135e89a38af131ec52e/ext/pdo/php_pdo_driver.h#L407) — `struct pdo_stmt_methods` | Interface PDO et durées de vie à respecter | packages/sql-native/mysqli (à créer) |
## WordPress/wordpress-playground

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-047 | [packages/php-wasm/web-service-worker/src/lib/utils.ts:16](https://github.com/WordPress/wordpress-playground/blob/a4dbcd0bf65a82e10a5d3821f5023aeee81097e6/packages/php-wasm/web-service-worker/src/lib/utils.ts#L16) — `convertFetchEventToPHPRequest` | Transformer fetch en requête PHP ; pas de moteur dans le SW | apps/studio + packages/http-router (à créer) |
| SRC-048 | [packages/php-wasm/web-service-worker/src/lib/utils.ts:73](https://github.com/WordPress/wordpress-playground/blob/a4dbcd0bf65a82e10a5d3821f5023aeee81097e6/packages/php-wasm/web-service-worker/src/lib/utils.ts#L73) — `broadcastMessageExpectReply` | Adapter découverte/broadcast vers un seul propriétaire connu | apps/studio + packages/http-router (à créer) |
| SRC-049 | [packages/php-wasm/web-service-worker/src/lib/messaging.ts:51](https://github.com/WordPress/wordpress-playground/blob/a4dbcd0bf65a82e10a5d3821f5023aeee81097e6/packages/php-wasm/web-service-worker/src/lib/messaging.ts#L51) — `export function postMessageExpectReply` | Corréler requestId et réponse ; nettoyer timeout et ports | apps/studio + packages/http-router (à créer) |
| SRC-050 | [packages/php-wasm/scopes/src/lib/scope.ts:30](https://github.com/WordPress/wordpress-playground/blob/a4dbcd0bf65a82e10a5d3821f5023aeee81097e6/packages/php-wasm/scopes/src/lib/scope.ts#L30) — `export function` | Routage scoped ; distinguer runtimeId et sessionId | apps/studio + packages/http-router (à créer) |
| SRC-051 | [packages/php-wasm/universal/src/lib/http-cookie-store.ts:6](https://github.com/WordPress/wordpress-playground/blob/a4dbcd0bf65a82e10a5d3821f5023aeee81097e6/packages/php-wasm/universal/src/lib/http-cookie-store.ts#L6) — `export class` | Un cookie jar virtuel par joueur, pas les cookies globaux du site | apps/studio + packages/http-router (à créer) |
| SRC-052 | [packages/php-wasm/universal/src/lib/php-request-handler.ts:203](https://github.com/WordPress/wordpress-playground/blob/a4dbcd0bf65a82e10a5d3821f5023aeee81097e6/packages/php-wasm/universal/src/lib/php-request-handler.ts#L203) — `export class` | Document root et résolution HTTP/static/PHP | apps/studio + packages/http-router (à créer) |
## joomengine/php-wasm

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-053 | [versions.json:71](https://github.com/joomengine/php-wasm/blob/3b8cef42c020fbcbb6b41fad86716b7c8664b55b/versions.json#L71) — `"pdo_mariadb_wasm"` | Le runtime épingle un autre commit du bridge : pas de compatibilité supposée | alternative au runtime principal (décision ouverte) |
| SRC-054 | [src/index.mjs:7](https://github.com/joomengine/php-wasm/blob/3b8cef42c020fbcbb6b41fad86716b7c8664b55b/src/index.mjs#L7) — `export` | Alternative API runtime native, pas un deuxième moteur simultané | alternative au runtime principal (décision ouverte) |
| SRC-055 | [README.md:141](https://github.com/joomengine/php-wasm/blob/3b8cef42c020fbcbb6b41fad86716b7c8664b55b/README.md#L141) — `hostCalls` | Contrat hostcall et garanties HTTP documentées | alternative au runtime principal (décision ouverte) |
## emscripten-core/emscripten

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-056 | [system/lib/wasmfs/backends/opfs_backend.cpp:147](https://github.com/emscripten-core/emscripten/blob/91d14a4c6729752ed146751416fe96598cac3dc7/system/lib/wasmfs/backends/opfs_backend.cpp#L147) — `class OPFSFile` | Backend fichier WasmFS ; lectures/écritures par offset | packages/files/native-vfs (à créer) |
| SRC-057 | [system/lib/wasmfs/backends/opfs_backend.cpp:23](https://github.com/emscripten-core/emscripten/blob/91d14a4c6729752ed146751416fe96598cac3dc7/system/lib/wasmfs/backends/opfs_backend.cpp#L23) — `class Worker` | Proxy et contraintes pthread/JSPI à tester | packages/files/native-vfs (à créer) |
| SRC-058 | [src/lib/libwasmfs_opfs.js:243](https://github.com/emscripten-core/emscripten/blob/91d14a4c6729752ed146751416fe96598cac3dc7/src/lib/libwasmfs_opfs.js#L243) — `createSyncAccessHandle` | Accès OPFS synchrone dans Dedicated Worker | packages/files/native-vfs (à créer) |
| SRC-059 | [system/lib/wasmfs/backends/opfs_backend.cpp:268](https://github.com/emscripten-core/emscripten/blob/91d14a4c6729752ed146751416fe96598cac3dc7/system/lib/wasmfs/backends/opfs_backend.cpp#L268) — `class OPFSDirectory` | Renommage, troncature, fichiers ouverts, conformité MariaDB | packages/files/native-vfs (à créer) |
## zen-fs/core

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-060 | [src/mixins/async.ts:63](https://github.com/zen-fs/core/blob/ecb25b1bfd81879ef79052156c0171f215117b59/src/mixins/async.ts#L63) — `export function Async` | Évaluer les caches et préchargements du VFS async/sync | packages/files ou transport (à créer) |
## zen-fs/dom

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-061 | [src/access.ts:56](https://github.com/zen-fs/dom/blob/d9d9288471c7825a5ead485440aa87dec3c38ee2/src/access.ts#L56) — `export class WebAccessFS` | Backend handles : index et parcours récursif, pas accès synchrone garanti | packages/files ou transport (à créer) |
## zen-fs/emscripten

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-062 | [src/plugin.ts:44](https://github.com/zen-fs/emscripten/blob/c9d5c47d0a420e0fa05d635d106457bf56c17dc0/src/plugin.ts#L44) — `export default class EmscriptenPlugin` | Montage ZenFS dans Emscripten ; mesurer copies et caches | packages/files ou transport (à créer) |
| SRC-063 | [src/backend.ts:29](https://github.com/zen-fs/emscripten/blob/c9d5c47d0a420e0fa05d635d106457bf56c17dc0/src/backend.ts#L29) — `export` | Sens inverse Emscripten vers ZenFS : choisir un seul VFS | packages/files ou transport (à créer) |
## kachurun/opfs-worker

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-064 | [src/core/OPFSSync.ts:38](https://github.com/kachurun/opfs-worker/blob/c8813394795bcb26a0030ea94697114c59ec5b7e/src/core/OPFSSync.ts#L38) — `export class OPFSSync` | Gestion des descripteurs et partage du sync handle par fichier | packages/files ou transport (à créer) |
| SRC-065 | [src/core/OPFSSync.ts:75](https://github.com/kachurun/opfs-worker/blob/c8813394795bcb26a0030ea94697114c59ec5b7e/src/core/OPFSSync.ts#L75) — `async readFile` | Alloue tout le fichier ; préférer read par blocs pour gros médias | packages/files ou transport (à créer) |
| SRC-066 | [src/core/OPFSAsync.ts:34](https://github.com/kachurun/opfs-worker/blob/c8813394795bcb26a0030ea94697114c59ec5b7e/src/core/OPFSAsync.ts#L34) — `export class OPFSAsync` | Comparer backend async et opérations disponibles | packages/files ou transport (à créer) |
## GoogleChromeLabs/comlink

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-067 | [src/comlink.ts:578](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/src/comlink.ts#L578) — `export function transfer` | Transferts ArrayBuffer ; ne pas transférer une vue mémoire WASM | packages/files ou transport (à créer) |
| SRC-068 | [src/comlink.ts:301](https://github.com/GoogleChromeLabs/comlink/blob/114a4a6448a855a613f1cb9a7c89290606c003cf/src/comlink.ts#L301) — `export function expose` | Alternative RPC : éviter empilement avec quickbus | packages/files ou transport (à créer) |
## drawdb-io/drawdb

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-069 | [src/components/EditorCanvas/Table.jsx:8](https://github.com/drawdb-io/drawdb/blob/dc32c8bde614c931ec8bf3b3c346500d7626ab72/src/components/EditorCanvas/Table.jsx#L8) — `const` | Tables déplaçables : réécrire une interface légère ciblée | apps/database-ui (à créer) |
| SRC-070 | [src/components/EditorCanvas/Relationship.jsx:11](https://github.com/drawdb-io/drawdb/blob/dc32c8bde614c931ec8bf3b3c346500d7626ab72/src/components/EditorCanvas/Relationship.jsx#L11) — `const` | Relations visuelles ; traduire en SQL après validation réelle | apps/database-ui (à créer) |
| SRC-071 | [src/utils/importFrom/schemaQuery/mariadb.js:3](https://github.com/drawdb-io/drawdb/blob/dc32c8bde614c931ec8bf3b3c346500d7626ab72/src/utils/importFrom/schemaQuery/mariadb.js#L3) — `SELECT` | Introspection MariaDB ; conserver détails PK/FK/index composites | apps/database-ui (à créer) |
## chartdb/chartdb

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-072 | [src/lib/data/import-metadata/scripts/mysql-script.ts:17](https://github.com/chartdb/chartdb/blob/57bca690cc180f7501c6aa0c163c3b1dd418efa7/src/lib/data/import-metadata/scripts/mysql-script.ts#L17) — `SELECT` | Requête de métadonnées ; à adapter au moteur embarqué | apps/database-ui (à créer) |
| SRC-073 | [src/pages/editor-page/canvas/table-node/table-node.tsx:57](https://github.com/chartdb/chartdb/blob/57bca690cc180f7501c6aa0c163c3b1dd418efa7/src/pages/editor-page/canvas/table-node/table-node.tsx#L57) — `export` | Présentation colonnes/clés sans inclure toute application | apps/database-ui (à créer) |
| SRC-074 | [src/pages/editor-page/canvas/relationship-edge/relationship-edge.tsx:16](https://github.com/chartdb/chartdb/blob/57bca690cc180f7501c6aa0c163c3b1dd418efa7/src/pages/editor-page/canvas/relationship-edge/relationship-edge.tsx#L16) — `export` | Arêtes et édition des relations | apps/database-ui (à créer) |
## outerbase/studio

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-075 | [src/drivers/mysql/generate-schema.ts:132](https://github.com/outerbase/studio/blob/70c9d8e9745c161fb84746d3372bdab838c9bb36/src/drivers/mysql/generate-schema.ts#L132) — `export` | Génération SQL de structure à comparer au introspecteur | apps/database-ui (à créer) |
| SRC-076 | [src/core/query-pipeline.tsx:1](https://github.com/outerbase/studio/blob/70c9d8e9745c161fb84746d3372bdab838c9bb36/src/core/query-pipeline.tsx#L1) — `export` | Chaîne requête/résultats/erreurs ; console native JS | apps/database-ui (à créer) |
| SRC-077 | [src/lib/build-table-result.ts:12](https://github.com/outerbase/studio/blob/70c9d8e9745c161fb84746d3372bdab838c9bb36/src/lib/build-table-result.ts#L12) — `export` | Résultats tabulaires ; plafonner pagination et taille cellule | apps/database-ui (à créer) |
## xyflow/xyflow

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-078 | [packages/react/src/components/Handle/index.tsx:36](https://github.com/xyflow/xyflow/blob/d4bc936edad07aba995dbdb8e2c63af8cdd631c9/packages/react/src/components/Handle/index.tsx#L36) — `export` | Poignées de liaison entre colonnes | apps/database-ui (à créer) |
| SRC-079 | [packages/system/src/xyhandle/XYHandle.ts:323](https://github.com/xyflow/xyflow/blob/d4bc936edad07aba995dbdb8e2c63af8cdd631c9/packages/system/src/xyhandle/XYHandle.ts#L323) — `export` | Validation des interactions et nouvelles relations | apps/database-ui (à créer) |
## codemirror/lang-sql

| ID | Source exacte | Intérêt et adaptation | Destination |
|---|---|---|---|
| SRC-080 | [src/sql.ts:236](https://github.com/codemirror/lang-sql/blob/f5b0b0ba1811f87db2d1733f005585bd43322980/src/sql.ts#L236) — `export const MariaSQL` | Dialecte MariaDB pour éditeur SQL chargé à la demande | apps/database-ui (à créer) |
| SRC-081 | [src/complete.ts:170](https://github.com/codemirror/lang-sql/blob/f5b0b0ba1811f87db2d1733f005585bd43322980/src/complete.ts#L170) — `export` | Complétion à partir des métadonnées réelles | apps/database-ui (à créer) |
