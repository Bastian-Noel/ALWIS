# Analyse verrouillée — quatre moteurs de référence (jalon 2)

Date d'analyse : 2026-10-31. Ce dossier est une lecture des snapshots épinglés ; il ne décrit pas un runtime WASMWebServer fusionné. Sources historiques : `provenance/conversation-source.md` et `provenance/conversation-complementaire.txt` ; cadrage prioritaire : `docs/compatibility.md`.

## Versions et familles **non interchangeables**

| Famille | Révision / version exacte | Chaîne et rôle |
|---|---|---|
| Sean Morris PHP | `seanmorris/php-wasm@1e1fb6703730759181e84c62bce35ee9129febb9` ; npm 0.2.0, PHP 8.4.1 dans le témoin du bridge | Scripts/Makefile, image SDK patchée, wrappers PHP CGI et hôte |
| JoomEngine PHP | `joomengine/php-wasm@3b8cef42c020fbcbb6b41fad86716b7c8664b55b` ; PHP 8.4.27 | `build/build.sh 8.4` construit le PHP natif et son runtime. `versions.json` verrouille le bridge **0.1.1** (`c1878dbb23c8e98d67983251ba7eb26a28b8edaa`), archive SHA-256 `99f4c568ee6d52b70600e9fba75e3aa4d3d94c031157d4910409c57e71bf79eb` |
| Bridge MariaDB/PDO | `joomengine/mariadb-wasm-bridge@56d47b4dc867af313592efa09e12df470a36e129` ; 0.1.8 | `scripts/build-engine.mjs` compile MariaDB patchée ; `native/build-upstream.sh` construit uniquement un **SIDE_MODULE PDO**, attendu par Sean Morris PHP 8.4.1 |
| lite4mariadb | `shyim/lite4mariadb@24be9371a2f6c71250a2356631ad6feab2280b02` ; 0.1.2 | `wasm/build.sh` : outils hôtes, `import_executables.cmake`, cross-compilation CMake, libmariadbd, InnoDB |
| Toolchain | emsdk `d7b4130688bfa348392b921ab04015aa15c4f154`, Emscripten 6.0.6 | Même SDK vérifié pour les témoins ; ne pas employer `emscripten` HEAD de la cartographie |

Deux chemins de validation **distincts** ont été testés en CI : (A) Sean Morris PHP 8.4.1 + bridge 0.1.8, et (B) JoomEngine PHP 8.4.27 + son bridge 0.1.1. Les tests verts de A et B ne valident pas leur combinaison mutuelle.

## Cartographie par cycle de vie

| Phase | PHP | MariaDB / bridge | Contrat pour la future fusion |
|---|---|---|---|
| Compilation | `Makefile` Sean Morris ; `build/build.sh` JoomEngine produit `libphp.a` et lie `native/runtime.c` | `wasm/build.sh` compile `mysqlserver` avec pthreads et exceptions ; le bridge ajoute un patch de sessions ; PDO C en SIDE_MODULE dans A | Choisir un seul SDK/ABI/options pthread, exceptions et Asyncify cohérentes. Les deux fichiers WASM amont ne se concatènent pas |
| Initialisation | `createPHP` instancie un Worker et le runtime CGI/CLI | `createMariaDB` démarre un Worker et `l4m_open` appelle `mysql_server_init`, datadir et connexion embarquée | Un propriétaire projet, état PHP/SQL distinct ; SQL démarre seulement lors du premier besoin |
| Requête HTTP | `php.request` traite méthode, script, entêtes et corps via CGI | PDO natif demande l'hôte par `php_wasm_host_call` / `mariadb.v1` | Les headers, sessions/cookies et requêtes restent indépendants des fenêtres |
| SQL/valeurs | PDO expose DSN, `query`, `prepare`, `fetch`, transaction au code PHP | `src/protocol.mjs` : `connect/query/close`, état de session et métadonnées ; JSON + cellules base64 ; `l4m_query` matérialise un résultat | Pont natif à types/longueurs explicites ; possesseurs de connexions et de buffers ; préserver NULL/BLOB/DECIMAL/BIGINT |
| Connexions | Destructeur / RSHUTDOWN PDO après requête | Patch bridge : sessions SQL indépendantes ; protocole gère leases et rollback par fermeture | Nettoyage par ownerId (PHP/console), pas de reset global lors d'une fin de requête |
| Fichiers | `php.fs`, FS virtuel ; Sean Morris expérimente IDBFS incrémental et OPFS | datadir `/mariadb/data`, checkpoint puis `flush` IDBFS et IndexedDB | Un datadir écrivain ; ne pas assimiler COMMIT SQL à persistance navigateur ; tester crash/reprise et OPFS |
| Arrêt | `php.close`, Worker détruit | `l4m_close` appelle `mysql_server_end` ; `db.close`, `db.reset` | Mesurer arrêt/redémarrage, absence de fuite, mémoire vivante vs pages WASM/résident navigateur |

## Contraintes natives observées

- lite4mariadb original : mémoire initiale WASM 256 Mio, maximum 2 Gio, `PTHREAD_POOL_SIZE=16` ; buffer InnoDB initial 16 Mio. Patch de sessions du bridge : buffer 64 Mio, 32 sessions en sus, paramètres InnoDB ajustés. Ce sont des paramètres de build, **pas des mesures RAM**.
- JoomEngine PHP : mémoire initiale 128 Mio, pile 16 Mio, Asyncify ; la ligne de lien étudiée n'utilise pas `-pthread`. C'est le principal risque du premier lien PHP + MariaDB dans un seul WASM.
- La couche bridge impose des appels SQL auxiliaires par requête (`SET NAMES`, `@@sql_mode`, `LAST_INSERT_ID` / transaction). Les retirer sans tests casserait des comportements applicatifs.
- L'appel public SQL du bridge est `db.hostCalls['mariadb.v1']` ; il n'expose pas de `connect()` et `query()` directs. Toujours mesurer le protocole réellement utilisé.
- `mysql_server_end` ne prouve pas que le moteur peut redémarrer dans la même instance ni rendre de la RAM au navigateur.
- Le bridge et ses tests s'appuient sur `crossOriginIsolated` et SharedArrayBuffer/pthreads, contrairement à PHP seul.

## Décisions de jalon 2

1. **Reproduire les deux familles A/B isolément**, avec manifests, patches amont et SHA-256. Le témoin original MariaDB est une troisième branche et doit rester identifiable.
2. **Ne pas commencer le lien unique tant que le témoin n'est pas mesuré** en navigateur ; documenter les échecs et corrections strictement de compilation.
3. **Faire démarrer SQL à la demande**, avec états natifs contrôlés ; mesurer les arrêts avant d'en faire une API publique.
4. **Cibler PDO puis MySQLi après un spike natif**, sans une couche de conversions JS dans la future ABI.
5. Le routage N fenêtres/sessions, outils UI et stockage OPFS sont des jalons ultérieurs ; deux joueurs ne limitent pas le modèle.

Code précis : `docs/README.md` (SRC-001 à SRC-081), `engine/baseline/INTEGRATION-POINTS.md`, `docs/README.md`. Les documents d'époque dans `provenance/` restent inchangés.
