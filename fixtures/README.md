# Jeux de validation à exécuter quand le moteur sera disponible

Ces fichiers PHP/SQL ne sont pas exécutés par les tests Node actuels.

1. Importer `school/schema.sql`, puis `multiplayer/schema.sql` avec un importeur SQL sachant traiter plusieurs instructions et les dumps. Le bridge actuel n'accepte qu'une instruction par requête : ne pas découper naïvement sur les `;`.
2. Monter `school/pdo.php` et `school/mysqli.php` dans le projet. Les deux doivent répondre `ok: true`, avec les mêmes types/valeurs. Les insertions sont volontairement conservées pour vérifier la persistance après redémarrage.
3. Servir `multiplayer/state.php` dans deux prévisualisations ayant des cookie jars virtuels différents, avec la même base.
4. Chaque joueur lit l'état, puis POSTe `{"version":0,"state":"move-1"}` avec la version courante. Deux écritures sur la même version doivent produire un succès et un HTTP 409.
5. Polling à 5 puis 10 Hz par joueur, une requête en vol par joueur ; mesurer p50/p95, file et mémoire pendant dix minutes. Pas de chargeur de test prétendant exécuter PHP tant que le moteur n'est pas intégré.

Le host `localhost` est une convention virtuelle ; aucun serveur MySQL réseau n'est prévu. Ces fixtures valident des opérations natives attendues ; aucun polyfill PHP MySQLi n'est fourni.
