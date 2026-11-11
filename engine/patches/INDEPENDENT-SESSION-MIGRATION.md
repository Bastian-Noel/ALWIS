# ALWIS — remplacement candidat du patch MariaDB/WASM

**Correction du 11 novembre 2026 :** la [notice du commit historique](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/patches/NOTICE) place explicitement le patch moteur et le glue modifié sous GPL-2.0-only. Leur attribution précédente à Apache-2.0 était erronée : la licence racine du dépôt ne remplace pas cette notice spécifique. Le moteur ALWIS indépendant reste retenu pour sa reconstruction vérifiable.

**État : candidat de développement, non intégré au binaire distribué, sans validation de stabilité native et sans validation juridique.**

Ce document décrit intégralement les changements fonctionnels du patch amont `independent-sessions.patch` de JoomEngine (179 lignes de diff, 5 fichiers, 11 hunks), sans recopier le code tiers. Source de comparaison : [commit épinglé](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/patches/engine/independent-sessions.patch). Référence MariaDB propre : `shyim/lite4mariadb@24be9371a2f6c71250a2356631ad6feab2280b02`.

## Inventaire fonctionnel complet des onze hunks

| # | Fichier et zone | Ce que fait le patch amont | Équivalent ALWIS ou décision |
| --- | --- | --- | --- |
| 1 | `mysys/get_password.c` en-têtes | Ajoute l'en-tête standard pour les fonctions de classification de caractères en C. | Adaptateur de portabilité ALWIS, sans logique métier. |
| 2 | `storage/innobase/buf/buf0flu.cc` en-têtes | Active conditionnellement l'API de gestion des threads Emscripten. | Import conditionnel, ciblé au build WASM. |
| 3 | `buf0flu.cc`, `buf_flush_wait` | Après la fin d'une attente d'E/S AIO, et **après** le déverrouillage de la latch log et du mutex de la liste de flush, laisse du temps au thread nettoyeur ; reprend ensuite les verrous et revérifie le checkpoint. | Adaptateur local : suspension coopérative d'1 ms seulement sous Emscripten, avec vérification des déverrouillages et de la reprise des verrous. |
| 4 | `storage/innobase/log/log0log.cc` en-têtes | Active conditionnellement l'API de threads Emscripten. | Même adaptation de portabilité, distincte. |
| 5 | `log0log.cc`, `checkpoint_margin` | Dans la boucle attendant un checkpoint, rend brièvement la main **avant** d'acquérir le verrou en écriture de la latch. | Adaptateur local : attente coopérative d'1 ms avant la prise du verrou, puis contrôle normal du checkpoint après acquisition. |
| 6 | `wasm/CMakeLists.txt`, exports | Ajoute à l'API du moteur témoin trois opérations : ouvrir une connexion SQL, exécuter pour cette connexion, fermer cette connexion. | **Non requis par le runtime ALWIS final** : les connexions PDO/MySQLi appartiennent au gestionnaire propre `packages/sql-native/src/pbl_mysql.c` et ne sont pas exposées comme `l4m_session_*`. |
| 7 | `wasm/CMakeLists.txt`, pool | Rend la gestion du pool de pthreads plus stricte au démarrage Emscripten. | La cible ALWIS `pbl-runtime` possède déjà `PTHREAD_POOL_SIZE_STRICT=2` et son mécanisme de workers SQL au premier usage. |
| 8 | `wasm/lite4mariadb.c`, variables globales | Stocke au maximum 32 poignées SQL supplémentaires, distinctes de la connexion globale du témoin. | **Non requis** : le registre `connection_record` ALWIS associe chaque connexion à un propriétaire de requête. |
| 9 | `wasm/lite4mariadb.c`, démarrage | Étend les paramètres du témoin : buffer InnoDB 16 → 64 MiB, maximum potentiel 256 MiB, connexions 10 → 33, paquet jusqu'à 128 MiB, délais d'attente de verrous à 5 secondes. | Le profil ALWIS dédié maintient un buffer 16 MiB, 33 connexions, un paquet de 16 MiB et des délais de verrouillage de 5 secondes ; il complète ses budgets mémoire de manière propre. |
| 10 | `wasm/lite4mariadb.c`, fermeture | Ferme chaque connexion additionnelle avant la connexion globale et l'arrêt du serveur MariaDB embarqué. | `pbl_mysql_owner_cleanup` et `pbl_mysql_close` gèrent les connexions du demandeur, les instructions préparées, les rollbacks et l'arrêt ; le serveur ne ferme pas les autres propriétaires lors de la fin d'une requête. |
| 11 | `wasm/lite4mariadb.c`, nouvelles fonctions | Crée une connexion native, recherche une case libre, vérifie les limites, exécute une requête sous sa connexion, rétablit l'ancienne connexion globale et ferme uniquement cette poignée. | ALWIS appelle directement l'API `mysql_init`, `mysql_options`, `mysql_real_connect`, `mysql_real_query` et la fermeture des connexions via sa propre couche. Aucun basculement temporaire de pointeur global n'est nécessaire. |

**Conclusion technique :** sur les cinq fichiers historiques, les modifications à reconstruire spécifiquement dans le source MariaDB amont se réduisent à la portabilité C et aux deux points d'attente InnoDB. La gestion SQL multiple, les budgets et le pool pthread sont déjà traités par les sources ALWIS et ne justifient pas de recopier les 42 lignes de l'API de sessions du témoin.

## Adaptateur candidat réalisé

- `scripts/prepare-native-concurrency.py` : vérifie les SHA-256 des **sources amont non patchées**, puis peut ajouter trois modifications ciblées dans une **copie jetable** de MariaDB sous `build-work/`. Il refuse les changements d'ancres et conserve un reçu de provenance.
- `scripts/prepare-native-server.py` : prend maintenant en charge les paramètres du serveur MariaDB originel sans nécessiter les variables de sessions `l4m_session_*`.
- `scripts/build-independent-native.sh` : chemin explicite et distinct de la recette épinglée ; refuse les sources déjà patchées et les sources extérieures à `build-work/`. Le script `engine/native/build/build.sh` historique reste inchangé pour permettre sa vérification par le manifeste de l’ancien binaire.
- `tests/test_native_concurrency.py` : tests d'invariants sur la position des attentes, les verrous, l'absence d'application répétée et la génération des reçus.

Les invariants de synchronisation **ne constituent pas une preuve de stabilité**. En particulier, `emscripten_thread_sleep(1)` suppose que les threads auxiliaires du navigateur sont déjà actifs et que les locks InnoDB mentionnés sont libérés. Un changement de comportement du scheduler, de l'Asyncify ou du moteur d'E/S peut rendre cette approche insuffisante.

## Validation obligatoire avant toute substitution de binaire

1. Préparer un source MariaDB propre au commit exact, sans application préalable du patch JoomEngine. Vérifier les SHA des trois unités natives modifiées.
2. Recompiler le runtime PHP/MariaDB WASM intégré, avec `PBL_TARGET=pbl-runtime JOBS=3 bash scripts/build-independent-native.sh`. La compilation doit produire un manifeste des sources et du nouveau binaire.
3. Exécuter les tests natifs `test-native-runtime`, `mysqli-complete`, `database-stability`, `data-integrity`, `restart-native` dans Chromium et Firefox.
4. Ajouter des tests de charge : connexions simultanées proches du plafond, commits/rollbacks concurrents, transaction abandonnée sur une session, inserts et checkpoints sous écriture soutenue, contention InnoDB et arrêt/reprise.
5. Vérifier la persistance après rechargement, comparer la mémoire et les erreurs avec le moteur actuellement validé et effectuer une revue de l'ordonnancement des verrous.
6. Reconstituer le manifeste de sources natives, les licences et les notices puis réévaluer le blocage juridique **avant** d'autoriser FTP ou Docker.

**Aucune étape 2–6 n'est considérée comme achevée par la seule présence de l'adaptateur.** Les anciens artefacts natifs épinglés peuvent toujours contenir le patch GPLv2 original. La revue juridique devra également examiner le fait que ce travail a été effectué en connaissant le patch initial : il ne s'agit pas d'une démarche clean-room formelle. Ne pas changer `provenance/release-licensing-status.json` en `ready` sans preuves et audit.
