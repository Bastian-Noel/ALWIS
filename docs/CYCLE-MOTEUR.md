# Cycle PHP et MariaDB retenu

Décision utilisateur du 1 novembre 2026 : simplifier le cycle de vie en conservant deux états utilisables, **PHP seul** et **PHP + MariaDB**, plutôt que chercher à arrêter puis redémarrer MariaDB dans le même WASM.

## Fonctionnement retenu

- À l'ouverture, PHP est disponible et MariaDB reste non initialisée. Le binaire commun contient toujours les deux moteurs : cela ne constitue pas encore un téléchargement PHP seul, ni une réduction de la capacité linéaire réservée.
- La première ouverture native PDO MySQL ou MySQLi, ou une connexion de la console SQL, initialise MariaDB. La détection porte sur l'utilisation réelle du pilote ; aucune recherche de mots dans les fichiers PHP. PDO SQLite, par exemple, ne doit pas déclencher MariaDB.
- Ce premier démarrage fonctionne déjà dans l'instance courante : il ne nécessite ni redémarrage de PHP ni réexécution de la requête. L'implémentation actuelle peut initialiser SQL dès l'initialisation d'un handle MySQLi ; reporter jusqu'à la connexion effective reste un affinage de compatibilité.
- Une fois démarrée, MariaDB reste active jusqu'à la sauvegarde ou la fermeture du moteur. La fermeture d'une connexion PDO/MySQLi ou de la console ne signifie pas l'arrêt du serveur.
- La sauvegarde attend les requêtes acceptées, ferme proprement SQL, enregistre le snapshot, puis le studio crée un nouveau WASM. Le projet revient à PHP seul et la prochaine connexion peut réactiver SQL. Les fichiers, données SQL et sessions proviennent du snapshot ; piles PHP et connexions ne sont pas restaurées.
- Aucun arrêt/redémarrage SQL dans le même WASM n'est proposé. Après un arrêt ou une initialisation échouée, une nouvelle instance est requise. L'échec de sauvegarde reste visible et doit être résolu avant la reprise des clients.

La recréation d'un moteur ne doit **jamais rejouer automatiquement** une requête PHP déjà exécutée : un POST, un upload ou une écriture pourraient produire deux effets. Les fenêtres clientes restent ouvertes ; un rechargement éventuel est une nouvelle requête explicite. Aucun rejeu automatique n'est requis par le démarrage SQL actuel.

## Preuves et limites

Le démarrage paresseux est implémenté par `pbl_mysql_init_owner()` dans `packages/sql-native/src/pbl_mysql.c`, commun aux pilotes natifs et à la console. Les [preuves natives](../engine/fusion/NATIVE-RUNTIME-RECEIPT.md) et les [preuves de sauvegarde/récupération](../engine/fusion/STORAGE-RECOVERY-RECEIPT.md) décrivent les scénarios exécutés. L'abort du redémarrage SQL dans la même instance est conservé comme échec expérimental.

Un mode de préchauffage explicite « PHP + MariaDB dès l'ouverture » pourra appeler le même chemin natif ; il n'existe pas encore de sélecteur de mode dans l'interface. Une reconstruction imposée lors de la première activation n'apporterait ici aucun avantage démontré. Les économies de RAM navigateur restent à mesurer séparément de la capacité WASM et du tas occupé.
