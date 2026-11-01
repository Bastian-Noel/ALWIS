# Surface procédurale MySQLi : 106 entrées — 1 novembre 2026

Les **106 fonctions** des stubs PHP 8.4.27 sont enregistrées dans l'extension Zend C. Ce jalon complète la surface procédurale et donne une politique à chaque entrée ; il ne prétend pas reproduire mysqlnd, un serveur distant ni toutes les variantes de chaque API. L'[inventaire](../../packages/php-native/compatibility-inventory.json) distingue toujours fonctions, méthodes et enregistrement. Les propriétés et certains anciens alias objet demandent encore une consolidation.

## Fonctions natives ajoutées

- `real_query`, `store_result`, `use_result`, constructeur de résultat, modes bufferisé/non bufferisé : le mode non bufferisé copie une ligne à la fois vers PHP, garde sa connexion propriétaire et refuse seek/rewind. Le serveur embarqué collecte auparavant ses résultats sous quota ; ce n'est pas un flux réseau infini. Fermer la connexion invalide ses flux avant de libérer le pointeur C.
- `multi_query`, `more_results`, `next_result` et leurs variantes de statement, y compris une procédure retournant plusieurs jeux. Une requête directe normale désactive le mode multi-statements. Les connexions annoncent le support des résultats multiples.
- Options avant connexion : charset, commande d'initialisation, refus de LOCAL INFILE activé et conversion native int/float. Les décimaux et grands entiers hors plage PHP restent exacts. Les commandes d'initialisation s'exécutent après sélection de la base.
- Attributs des statements, `send_long_data`, concaténation de chunks binaires, reset/réexécution et nettoyage. Limites : **8 Mio par statement, 16 Mio par requête PHP** pour les chunks retenus.
- Erreurs globales de connexion, `error_list`, métadonnées charset, objets `mysqli_warning`, statistiques des liens locaux et statistiques réelles du serveur. L'interface C externe conserve la dernière erreur, sans prétendre fournir une pile mysqlnd exhaustive. Les warnings sont limités à 64 entrées.
- `change_user`, `refresh`, `kill` et `dump_debug_info` sont reliés aux commandes natives. Leur résultat dépend du serveur embarqué ; les refus serveur sont de vraies erreurs SQL. Kill d'une autre connexion est interdit pour préserver les propriétaires indépendants ; refresh est limité aux commandes grant/log/table/status.

Un défaut amont a été reproduit : certains échecs de commandes comme COM_INIT_DB n'étaient pas transférés vers les diagnostics NET du client embarqué. La copie générée de `lib_sql.cc` conserve maintenant errno, message et SQLSTATE du serveur. Une connexion à une base absente renvoie ainsi réellement 1049, sans décrémenter les liens existants.

## Six fonctions avec refus systématique dans ce contexte

| API | Motif et comportement |
|---|---|
| `mysqli_ssl_set` | Aucun socket SQL : PHP et MariaDB communiquent dans le même module ; LogicException explicite |
| `mysqli_poll`, `mysqli_reap_async_query` | Pas de transport asynchrone mysqlnd ; utiliser le worker de projet sérialisé |
| `mysqli_get_client_stats`, `mysqli_get_connection_stats` | Statistiques mysqlnd absentes du client C externe ; aucune valeur inventée |
| `mysqli_debug` | Traçage DBUG absent du build Release ; journal local disponible |

D'autres paramètres ont des restrictions explicites : options réseau, flags mysqlnd de store_result, kill inter-propriétaire et flags de refresh hors périmètre. Compter 106 noms ne transforme pas ces restrictions en compatibilité complète. Les classes/propriétés et les variantes avancées doivent rester dans la matrice de conformité.

## Mémoire et console SQL

Le collecteur natif borne désormais aussi les résultats **en attente d'une même connexion**, au lieu de limiter uniquement chaque jeu : 16 Mio de blocs, 10 000 lignes et 32 enveloppes de résultats. Les refus sont testés sur une succession de SELECT et sur plusieurs résultats de 2 Mio, puis une requête de récupération. Ces bornes n'additionnent pas tous les caches, toutes les connexions ou les allocations de travail SQL ; elles ne prouvent pas une limite de RAM physique universelle.

La console dispose d'une opération `sqlScript` sérialisée : 1–256 instructions, lecture des résultats multiples via le même protocole binaire C, total de sortie limité à 16 Mio et 10 000 lignes. Une erreur ferme la connexion de console et signale que des instructions antérieures peuvent déjà être appliquées. Cela n'annonce pas une transaction atomique pour les DDL.

## Preuves

`PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/mysqli-complete.mjs` passe dans [Chromium](receipts/mysqli-complete/chromium.json) et [Firefox](receipts/mysqli-complete/firefox.json). Le test vérifie les 106 noms réellement disponibles, les nouveaux parcours, les refus de plateforme, les quotas/récupérations, les valeurs exactes et les compteurs connexions/statements remis à zéro. Les appels d'administration dépendent du serveur et n'ont pas tous un scénario positif dédié.

La suite native précédente a également été rejouée sur les deux navigateurs : CGI, réseau, PDO/MySQLi, budgets, nettoyage, sauvegarde, erreur injectée et restauration. Les reçus du présent jalon sont conservés dans `receipts/mysqli-complete/`, avec ABI, adaptations générées et hashes du WASM. Le module principal fait 38 249 873 octets ; la capacité linéaire reste 256 Mio dans ces scénarios. Aucune nouvelle PSS navigateur n'est annoncée.
