# Studio navigateur du runtime natif

Démarrage après compilation du target `pbl-runtime` :

```sh
node scripts/serve-studio.mjs
```

Le serveur de développement fournit uniquement les ressources statiques, les en-têtes COOP/COEP et le module compilé. PHP et MariaDB s'exécutent dans le navigateur. Le studio possède un Worker moteur par projet ; le Service Worker route les requêtes des fenêtres vers ce propriétaire. Fermer le studio coupe donc le service des clients.

Ouvrir un projet, charger l'exemple scolaire dans un projet vide, puis ouvrir plusieurs fenêtres. « Fenêtre dans cette session » partage les cookies/PHPSESSID ; « Nouveau client indépendant » crée une identité distincte. Toutes utilisent la même base. Les requêtes PHP sont sérialisées dans la file bornée du moteur.

L'éditeur lit et écrit le même VFS que PHP. La console et la grille interrogent directement le pont C ; la grille permet de modifier une cellule lorsqu'une clé primaire existe (1 000 lignes maximum). Le schéma lit `information_schema` et permet de déplacer les tables ; le champ DDL applique une modification SQL puis relit le schéma. Les outils peuvent être mis en veille ou déchargés avec conservation du brouillon dans IndexedDB. Le déchargement SQL ferme sa connexion et annule ses transactions non validées.

« Sauvegarder » ferme SQL proprement, synchronise les magasins IDBFS fichiers/SQL, puis recrée le moteur. Les changements non sauvegardés peuvent être perdus si l'onglet est arrêté. L'export ZIP contient **les fichiers seulement** ; ce n'est pas une sauvegarde SQL. L'import accepte les ZIP stockés/déflatés et vérifie chemins, CRC et limites. L'import SQL passe le texte au vrai driver PDO ; les commandes client `DELIMITER` ne sont pas du SQL serveur pris en charge.

## Portée actuelle

L'isolation virtuelle d'une même origine couvre cookies, localStorage et noms IndexedDB usuels ; sessionStorage reste propre à chaque fenêtre. Le bootstrap réécrit les URL usuelles de liens, formulaires, fetch et XHR. Ce mécanisme n'est pas une frontière de sécurité pour du code hostile, ni une émulation complète d'une origine navigateur : CSP, iframes, Workers créés par les projets, autres API de stockage et domaines de cookies parents demandent encore du travail. Une isolation par véritables origines reste à comparer.

Le réseau PHP utilise les streams HTTP/HTTPS C soumis aux règles CORS et aux restrictions du navigateur. Aucun socket TCP/UDP général n'est fourni. MySQLi reste un sous-ensemble explicite, décrit dans `packages/php-native/README.md`.

Vérification ciblée, avec les navigateurs Playwright installés :

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/studio.mjs
```

Les reçus et captures de ce scénario vont dans `build-work/studio-receipts/`. Un échec n'est jamais un reçu de réussite. La capacité linéaire WASM affichée ne représente pas la RAM résidente ; les gains mémoire du déchargement et la tenue en charge restent à mesurer.
