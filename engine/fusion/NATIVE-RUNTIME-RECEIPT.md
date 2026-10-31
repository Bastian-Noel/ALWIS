# Runtime custom C — état vérifié au 31 octobre 2026

Le target `pbl-runtime` rassemble maintenant PHP, MariaDB, PDO adapté, MySQLi natif, opérations de fichiers et streams HTTP navigateur dans un même module principal. **Les parcours de bout en bout passent sur Chromium et Firefox.** Les JSON bruts, ABI, adaptateurs générés et empreintes des sources/binaires sont dans [receipts/native-runtime](receipts/native-runtime).

## Fonctionnement exécuté

- PHP seul sert une requête CGI GET/POST avec status 201 et en-tête, lit un fichier écrit/renommé par le gestionnaire POSIX C et ne démarre pas MariaDB.
- `file_get_contents()` ouvre un vrai stream HTTP via Emscripten fetch dans le Worker et retrouve la réponse du serveur de test. Un second parcours POST vérifie le corps, un en-tête personnalisé, le status 202 et `$http_response_header`. CORS et règles du navigateur restent applicables.
- PDO et MySQLi utilisent le même registre de connexions C et la même MariaDB embarquée ; aucun appel SQL n'utilise le pont JavaScript JSON/base64.
- Les deux fixtures `fixtures/school/{pdo,mysqli}.php` sont exécutées **sans modification** : transactions, valeurs liées, référence modifiée avant execute, NULL, Unicode, DECIMAL, BIGINT exact et BLOB avec NUL/FF.
- La surface MySQLi objet est également exécutée : prepare/bind_param/execute/get_result/fetch_assoc/close, puis bind_result/store_result/fetch, types natifs, fetch_all/fetch_array/data_seek et accès refusé après libération du résultat.
- La console SQL native utilise une connexion distincte et un frame binaire typé ; son `@pbl_console_marker` survit à une requête PHP. Les frames console préservent NULL, BLOB brut en Uint8Array, BIGINT et DECIMAL exacts. Les connexions PHP reviennent à zéro après la fermeture de la console.
- L'arrêt explicite de SQL réussit après nettoyage des connexions ; une nouvelle requête PHP sans SQL fonctionne ensuite sans redémarrer MariaDB.
- Un projet avec clé persistante sauvegarde ses fichiers et sa base dans deux montages IDBFS distincts. Après arrêt du propriétaire et création d'un **nouveau Worker et d'une nouvelle instance WASM**, le fichier PHP est retrouvé, PDO lit la ligne sauvegardée et la console lit la même ligne. Le verrou navigateur empêche deux propriétaires écrivains sur une clé de projet.

La sauvegarde ferme la console (rollback des transactions non validées), arrête proprement SQL puis synchronise les montages. Elle n'annonce pas la durabilité d'un COMMIT non synchronisé. La preuve de reprise porte sur la recréation du propriétaire dans le même profil navigateur ; un arrêt physique du système ou un crash pendant syncfs n'est pas testé ici.

## Code principal

- `packages/sql-native/src/pbl_mysql.c` et `console.c` : propriétaire/connexions/transport console C.
- `packages/php-native/src/` : adaptateur PDO et extension MySQLi Zend native.
- `packages/files-native/src/files.c` : écriture atomique, rename/remove et contrôle des chemins projet.
- `packages/network-native/src/http-stream.c` : HTTP/HTTPS read streams navigateur.
- `packages/runtime/src/native-{runtime,worker}.mjs` : API fichiers/HTTP/SQL/sauvegarde et file bornée du propriétaire.

## Limites conservées

Le [studio navigateur](../../apps/studio/README.md) intègre désormais routage Service Worker, sessions clientes virtuelles, éditeur/SQL/schéma et cycles de déchargement. Ses reçus distincts vérifient quatre fenêtres avec trois identités et une base commune sur les deux navigateurs ; il reste un prototype avec les limites documentées. MySQLi est une extension native fonctionnelle sur les fixtures, pas une compatibilité complète mysqlnd ; la liste des méthodes manquantes est explicite dans `packages/php-native/README.md`. Les streams HTTP n'implémentent pas encore tous les headers/options de contexte PHP.

Les entrées, file et copies de résultats sont bornées ; la matérialisation du résultat interne MariaDB peut précéder la limite de copie. La capacité linéaire observée reste élevée (environ 740 Mio suivant le scénario), sans affirmation de RAM résidente ou d'objectif 300 Mio atteint. Le lien conserve des assertions et symboles de diagnostic ; la réduction mémoire et les comparaisons de performance ne sont pas déclarées accomplies.

Le défaut de démarrage CGI a été résolu en conservant l'attribution du module Zend après le démarrage du driver PDO et en plaçant l'inclusion MySQL après les headers PHP dans le runtime généré. Les assertions des fixtures et du parcours HTTP ont été conservées.
