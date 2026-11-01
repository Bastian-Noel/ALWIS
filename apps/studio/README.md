# Studio navigateur du runtime natif

Démarrage après compilation du target `pbl-runtime` :

```sh
node scripts/serve-studio.mjs
```

Le serveur de développement fournit uniquement les ressources statiques, les en-têtes COOP/COEP et le module compilé. PHP et MariaDB s'exécutent dans le navigateur. Le studio possède un Worker moteur par projet ; le Service Worker route les requêtes des fenêtres vers ce propriétaire. Fermer le studio coupe donc le service des clients.

Ouvrir un projet, charger l'exemple scolaire dans un projet vide, puis ouvrir plusieurs fenêtres. « Fenêtre dans cette session » partage les cookies/PHPSESSID ; « Nouveau client indépendant » crée une identité distincte. Toutes utilisent la même base. Les requêtes PHP sont sérialisées dans la file bornée du moteur.

L'éditeur lit et écrit le même VFS que PHP. La console et la grille interrogent directement le pont C ; la grille permet de modifier une cellule lorsqu'une clé primaire existe (100 lignes par page SQL, avec ordre par clé primaire lorsqu’elle existe). La grille préserve NULL et binaires, refuse une modification si les valeurs de la ligne ont changé et affiche structure/index. Un formulaire distingue DEFAULT, NULL, texte et binaire pour l’insertion ; une suppression demande confirmation et vérifie également la ligne d’origine. Le schéma lit `information_schema`, affiche toutes les colonnes, marque les clés et relie les colonnes des clés étrangères ; les tables sont déplaçables. Un formulaire crée une clé étrangère à partir du catalogue, avec action ON DELETE ; le champ DDL applique une modification SQL puis relit le schéma. Les outils peuvent être mis en veille ou déchargés avec conservation du brouillon dans IndexedDB. Le déchargement SQL ferme sa connexion et annule ses transactions non validées.

« Sauvegarder » ferme SQL proprement, synchronise un snapshot IDBFS commun fichiers/SQL/sessions pour les nouveaux projets (anciens magasins conservés en compatibilité), puis recrée le moteur. Les changements non sauvegardés peuvent être perdus si l'onglet est arrêté. L'export ZIP contient **les fichiers seulement**. Le bouton « Exporter la base SQL » produit séparément un dump logique de la base sélectionnée : tables/données, vues dépendantes, fonctions/procédures et triggers. Il préserve notamment NULL, BLOB, BIT, géométries et nombres exacts. Les événements SQL sont refusés explicitement, le dump est limité à 8 Mio et la limite native de résultat reste applicable. Restaurez dans un projet distinct ; ce n'est pas encore un paquet unique fichiers + toutes les bases. L'import accepte les ZIP stockés/déflatés et vérifie chemins, CRC et limites. L'import SQL vise la base sélectionnée et passe le texte au vrai driver PDO ; les instructions USE du fichier peuvent changer de base ; les commandes client `DELIMITER` ne sont pas du SQL serveur pris en charge.

## Portée actuelle

L'isolation virtuelle d'une même origine couvre cookies, localStorage et noms IndexedDB usuels ; sessionStorage reste propre à chaque fenêtre. Le bootstrap réécrit les URL usuelles de liens, formulaires, fetch et XHR. Ce mécanisme n'est pas une frontière de sécurité pour du code hostile, ni une émulation complète d'une origine navigateur : CSP, iframes, Workers créés par les projets, autres API de stockage et domaines de cookies parents demandent encore du travail. Une isolation par véritables origines reste à comparer.

Le réseau PHP utilise les streams HTTP/HTTPS C soumis aux règles CORS et aux restrictions du navigateur. Aucun socket TCP/UDP général n'est fourni. MySQLi reste un sous-ensemble explicite, décrit dans `packages/php-native/README.md`.

Vérification ciblée, avec les navigateurs Playwright installés :

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/studio.mjs
```

Les reçus et captures de ce scénario vont dans `build-work/studio-receipts/`. Un échec n'est jamais un reçu de réussite. La capacité linéaire WASM affichée ne représente pas la RAM résidente ; les gains mémoire du déchargement et la tenue en charge restent à mesurer.

La couverture reste inférieure à phpMyAdmin : création/modification assistée de colonnes, index et contraintes, paquet complet multi-bases et gestion de gros imports restent à compléter. Les commandes SQL explicites sont disponibles. Les limites du moteur ne doivent pas être masquées par l’interface.

Le changement de projet rend les outils inertes pendant la transition et refuse les actions mises en attente depuis un autre propriétaire. La vue SQL conserve table et page lors du déchargement et relit les données au retour. Les fichiers de projet cachés usuels (.env, .htaccess) sont affichés/exportés ; les sessions et fichiers internes du studio restent exclus.

La sauvegarde attend les requêtes déjà acceptées avant de figer les cookies/sessions. Après un échec de stockage, les nouveaux clients reçoivent 503 jusqu’au réessai. L’état SQL arrêté ne redémarre jamais dans le même WASM ; le studio recrée son propriétaire après sauvegarde réussie. Voir les [preuves de récupération](../../engine/fusion/STORAGE-RECOVERY-RECEIPT.md).
