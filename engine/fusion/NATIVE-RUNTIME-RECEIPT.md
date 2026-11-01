# Runtime custom C — état vérifié au 31 octobre 2026

Le target `pbl-runtime` rassemble maintenant PHP, MariaDB, PDO adapté, MySQLi natif, opérations de fichiers et streams HTTP navigateur dans un même module principal. **Les parcours de bout en bout passent sur Chromium et Firefox.** Les JSON bruts, ABI, adaptateurs générés et empreintes des sources/binaires sont dans [receipts/native-runtime](receipts/native-runtime).

## Fonctionnement exécuté

- PHP seul sert une requête CGI GET/POST avec status 201 et en-tête, lit un fichier écrit/renommé par le gestionnaire POSIX C et ne démarre pas MariaDB.
- `file_get_contents()` ouvre un vrai stream HTTP via Fetch/Asyncify dans le Worker et retrouve la réponse du serveur de test. Un second parcours POST vérifie le corps, un en-tête personnalisé, le status 202 et `$http_response_header`. CORS et règles du navigateur restent applicables.
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

Les entrées, file et copies de résultats sont bornées ; une adaptation générée du protocole MariaDB limite désormais aussi la collecte des résultats en amont. Le [profil réduit](../../benchmarks/native/README.md) conserve une capacité linéaire de 256 Mio sur le scénario observé, contre environ 740 Mio précédemment. Cela ne signifie pas moins de 300 Mio de RAM navigateur ; les JSON distinguent capacité, allocateur C et PSS globale. Le lien conserve des assertions et symboles de diagnostic ; la réduction mémoire et les comparaisons de performance ne sont pas déclarées accomplies.

Le défaut de démarrage CGI a été résolu en conservant l'attribution du module Zend après le démarrage du driver PDO et en plaçant l'inclusion MySQL après les headers PHP dans le runtime généré. Les assertions des fixtures et du parcours HTTP ont été conservées.

Le parcours de conformité `fixtures/compatibility/native-coverage.php` approfondit PDO préparé émulé/natif, fetch/bind/metadata et les refus de résultat, ainsi que les nouveaux appels MySQLi. La [matrice de compatibilité](../../packages/php-native/COMPATIBILITY.md) distingue enregistrement et preuve. La limite maximale du module est maintenant 512 Mio, avec piles pthread de 2 Mio et petit profil de caches.

Le [jalon de récupération du 1 novembre](STORAGE-RECOVERY-RECEIPT.md) remplace la limite initiale « nouveau Worker seulement » : snapshots atomiques pour les nouveaux projets, échec/retry de transaction et redémarrage/SIGKILL du navigateur sont exécutés. Le redémarrage SQL dans un même WASM est explicitement refusé après un abort reproduit ; la sauvegarde du studio recrée l’instance.

## Réception HTTP bornée — 1 novembre

Le wrapper XHR synchrone, qui recevait tout le corps avant de contrôler sa taille, est remplacé par Fetch avec lecture incrémentale, blocs possédés de 64 Kio et annulation au dépassement de 16 Mio. Asyncify conserve l'appel PHP synchrone habituel. Voir [le contrat réseau](../../packages/network-native/README.md) pour les copies temporaires et les buffers internes du navigateur.

`tests/browser/network-native.mjs` passe sur Chromium et Firefox : 13 scénarios, dont un corps binaire exact de 16 Mio, un producteur chunked de 64 Mio effectivement interrompu après respectivement 16 908 288 et 16 842 752 octets envoyés, un Content-Length excessif arrêté après 131 072/65 536 octets, une réponse gzip décompressée de 17 Mio refusée, timeout avant les en-têtes et pendant le corps, HEAD et erreurs HTTP. Après ces refus, une connexion SQL et une nouvelle lecture HTTP PHP réussissent. Les octets envoyés incluent le surplus en transit ; les blocs acceptés par l'application restent bornés à 16 Mio. Ces observations ne mesurent pas la RAM totale du navigateur.

Le parcours natif général a ensuite repassé sur les deux navigateurs avec le même nouveau binaire : POST/contexte HTTP, PDO, MySQLi, quotas VFS, snapshots atomiques et restauration historique. Reçus `chromium-network.json`, `firefox-network.json` et reçus généraux actualisés dans `receipts/native-runtime/`. Les tests de redémarrage complet du navigateur et du studio restent les preuves du jalon précédent ; ils n'ont pas été réexécutés pour ce changement réseau.

## MySQLi : hydratation et préparations — 1 novembre

Le parcours natif général passe de nouveau sur les deux navigateurs avec `native-convenience.php`, qui ajoute objets de résultat, execute_query et initialisation/préparation séparées des statements. Le premier essai a détecté un contrôle de classe trop restrictif ; le suivant a détecté la remise à zéro des compteurs par la fermeture du statement temporaire dans le client natif. Les deux ont été corrigés en conservant les assertions. L'inventaire atteint 72/106 fonctions procédurales enregistrées ; la conformité complète reste ouverte. Voir la matrice PHP pour le périmètre exécuté.

## Préparations bornées et nettoyage des résultats refusés

PDO et MySQLi utilisent désormais le même registre C de statements : 128 handles et 16 Mio de texte SQL réservé, refus de SQL supérieur à 8 Mio avant appel natif, fermeture et réutilisation vérifiées. L'adaptateur PDO couvre ses deux unités driver/statement, y compris les requêtes émulées. Les compteurs sont exportés dans l'état du runtime et reviennent à zéro après la fin de requête. Le profil serveur borne aussi les commandes SQL PREPARE à 128.

L'essai a aussi révélé une fuite de résultat partiel en erreur, corrigée dans la copie générée de lib_sql.cc. Les six refus console et six PDO successifs restent stables en allocations dans les deux navigateurs ; le parcours complet reste à 256 Mio de capacité. Voir les [mesures et le reçu d'échec préservé](../../benchmarks/native/README.md). La borne du texte préparé n'est pas une borne de toutes les allocations de travail du serveur.

## Workers SQL à la demande et paquet statique

Le module commence désormais sans Worker pthread auxiliaire. Avant le premier l4m_open, Asyncify attend le chargement d'un pool de 16, puis reprend la requête C/PHP existante. Le paquet statique exact passe sur Chromium/Firefox : PHP seul à 0 Worker auxiliaire, premier PDO/MySQLi à 16 créés, 15 utilisés au pic observé, POST et écriture préalable exécutés une seule fois, puis requête suivante réussie. Le parcours complet du studio repasse sur Chromium ; la compatibilité native générale reste celle du jalon précédent et n'est pas redéduite du seul smoke de paquet. Les traces et empreintes propres sont sous `receipts/lazy-sql-workers/` et `apps/studio/receipts/deployment/`. Le gain de PSS de ce chargement différé et les erreurs extrêmes de chargement restent à mesurer séparément.
