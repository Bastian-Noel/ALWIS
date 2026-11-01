# Validation navigateur

Les premières exécutions reprennent les suites amont sur leurs binaires compilés. La suite produit devra ensuite couvrir N fenêtres et groupes de sessions, cookies, formulaires, uploads, redirections, connexions SQL distinctes, sauvegarde et reprise après interruption.

Une réussite Node ne prouve pas un comportement navigateur. Un runtime npm précompilé ne prouve pas notre compilation PHP. Conserver ces catégories distinctes dans les rapports.

`network-native.mjs` exerce le wrapper HTTP du runtime custom compilé : corps binaires à la limite, réponse excessive annulée côté serveur, gzip, timeout et récupération PHP/SQL. Voir [le protocole et ses limites](../../packages/network-native/README.md). Ce test ciblé n'exécute pas les anciens témoins séparés.

`php-essentials.mjs` exécute les extensions PHP, un vrai upload multipart PNG, les préparations PDO natives/émulées (types, stringify, références, LOB et transactions) et les savepoints MySQLi sur une base partagée. Il démarre son propre serveur et conserve les reçus avec le hash du WASM. Commande : `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/php-essentials.mjs` lorsque les navigateurs de cet environnement sont dans ce cache.
