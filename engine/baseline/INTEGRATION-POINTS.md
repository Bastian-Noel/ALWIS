# Analyse préalable à la fusion

Inspection des snapshots verrouillés du 31 octobre 2026. Ce document décrit les contraintes observées ; il ne constitue pas une preuve de compilation fusionnée.

## Deux chaînes PHP à préserver

Le bridge `56d47b4…` attend le runtime Sean Morris 0.2.0 et PHP 8.4.1. Son `native/build-upstream.sh` compile uniquement un module PDO chargeable. La preuve de compilation PHP complète est apportée séparément par JoomEngine PHP `3b8cef4…` (PHP 8.4.27).

Ce dernier verrouille le **bridge 0.1.1 au commit `c1878dbb23c8e98d67983251ba7eb26a28b8edaa`**, pas le bridge 0.1.8 de notre autre témoin. Sa préparation vérifie l'archive runtime SHA-256 `99f4c568ee6d52b70600e9fba75e3aa4d3d94c031157d4910409c57e71bf79eb` et l'égalité des sources natives compilées. Toute modification de cette association demande une nouvelle validation complète.

## MariaDB et son cycle de vie

`shyim--lite4mariadb/wasm/lite4mariadb.c` expose `l4m_open`, `l4m_close`, `l4m_query`, `l4m_exec_multi`, `l4m_escape` et `l4m_free`.

- `l4m_open` appelle `mysql_server_init`, crée une connexion embarquée, configure utf8mb4 et la base `test`. Les chemins `/mariadb/data`, `/mariadb/share` et `/tmp` sont fixes dans ce témoin.
- `l4m_close` ferme la connexion puis appelle `mysql_server_end`. Une fonction d'arrêt existante ne prouve ni réinitialisation répétable ni restitution de mémoire au navigateur.
- La version originale emploie une connexion globale. Le patch amont du bridge ajoute les sessions indépendantes ; il faut préserver cette sémantique dans le backend commun.
- Le profil original est déjà réduit : buffer pool 16 Mio, log buffer 2 Mio, max_connections 10, table_open_cache 32, thread_cache_size 0, tâches IO/purge réduites. Le bridge change notamment le buffer pool : comparer les options effectives, pas seulement la configuration d'origine.

`wasm/CMakeLists.txt` lie `mysqlserver` avec pthreads, exceptions C++, 256 Mio de mémoire initiale, maximum 2 Gio, pile 2 Mio et pool initial de 16 pthreads. `INVOKE_RUN=0` et `EXIT_RUNTIME=0` évitent un démarrage automatique de main. Ce sont des capacités réservées/configurées, pas une mesure de RAM physique.

## PHP et le pont existant

JoomEngine `build/build.sh` produit `libphp.a`, puis lie `native/runtime.c`, ses bibliothèques et le pilote PDO dans le moteur PHP. Il utilise Asyncify, une mémoire initiale de 128 Mio et une pile de 16 Mio. Il ne passe pas `-pthread` dans la commande de lien observée.

Le bridge actuel traverse `php_wasm_host_call`/`mariadb.v1` : JSON pour le protocole, base64 pour les cellules. `src/protocol.mjs` traite connect/query/close et transporte métadonnées et état transactionnel. Une requête applicative entraîne aussi des opérations SQL internes (charset, SQL_MODE, LAST_INSERT_ID et transaction). Ce surcoût doit être mesuré et traité sans supprimer la sémantique requise.

L'API publique de la façade MariaDB est `hostCalls['mariadb.v1']`, `flush`, `reset`, `close` : elle n'expose pas directement `connect()` ou `query()`. Le banc de mesure doit utiliser le protocole réel.

## Conditions du premier lien unique

1. Recompiler les objets et dépendances PHP pour une ABI compatible avec la mémoire partagée/pthreads de MariaDB ; vérifier les options Emscripten communes et les exceptions. Réutiliser aveuglément une archive PHP compilée sans ces options n'est pas une recette validée.
2. Lier PHP, `mysqlserver` et le backend SQL sous une seule entrée contrôlée ; ne pas lancer MariaDB pendant l'initialisation d'un projet PHP sans SQL.
3. Éviter JSON/base64 sur la frontière native : paramètres typés, longueurs explicites, erreurs et résultats possédés. Préserver NULL, binaire, BIGINT/DECIMAL et métadonnées.
4. Garder un registre de connexions et résultats par propriétaire. Une fin de requête PHP ne doit fermer ni la console ni une autre connexion ; rollback des transactions abandonnées du seul propriétaire terminé.
5. Exporter les opérations console par la même API SQL, en bornant les lots et les résultats bufferisés.
6. Conserver les mêmes fixtures pour comparer témoin séparé et moteur unique. Aucun résultat simulé n'est une validation d'intégration.

## Arrêt SQL : expérience à trancher

Mesurer PHP seul avant tout démarrage SQL, SQL actif, après arrêt, puis après redémarrage. Vérifier requêtes, flush, transactions et données sur plusieurs cycles. Relever mémoire linéaire, allocations vivantes si instrumentables, mémoire navigateur disponible et durée de reprise. Fermer un Worker complet et libérer seulement MariaDB dans un Worker partagé sont deux expériences différentes.

Si l'arrêt n'apporte qu'un gain CPU sans gain RAM, le consigner ; ne pas le présenter comme un déchargement mémoire. Si son gain total est négligeable, conserver SQL à la demande et l'arrêt complet du runtime, sans fonction complexe d'arrêt SQL à chaud.
