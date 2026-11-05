# Campus des Tilleuls

Un nouveau petit site scolaire complet : **14 tables utilisées**, 18 liens SQL, 6 profils et 4 sessions préparées. Les données sont fictives. Les profils sont librement sélectionnables : ce n’est pas une authentification de production.

## À essayer

- Carnet commun : écrire dans une session, retrouver la note dans les autres.
- Notes : choisir un élève, conserver un nombre décimal exact ou NULL ; tenter une modification concurrente depuis deux professeurs.
- Présences : formulaire et lecture avec **MySQLi natif** ; les notes et la messagerie utilisent **PDO**.
- Messages : transaction sur deux tables ; un destinataire invalide annule les deux insertions et conserve le brouillon.
- Documents : upload TXT/CSV/PNG/JPEG (512 Kio), fichier dans `uploads/documents`, métadonnées dans MariaDB, lecture statique depuis OPFS.
- Élèves : filtre JavaScript ; cours, inscriptions N:N, responsables facultatifs et clés composées dans le schéma.
- `api/summary.php` : JSON via MySQLi, appelé par `fetch`, visible dans Réseau.
- `atelier.html` : HTML statique, PNG, SVG et exercice JavaScript. `exercices/a-formater.php` mélange PHP et HTML sans indentation ; `assets/css/compact.css` est aussi à formater.

Le PHP principal et les vues sont organisés en dossiers. Les fichiers d’exercice sont volontairement compacts mais fonctionnels. `database/schema.sql` contient structure et données ; `data/seed.json` est produit par le générateur ALWIS.

L’installation ne réinitialise pas les modifications à chaque visite. Enregistrez puis exportez le ZIP pour conserver les fichiers et les bases. Les anciens projets ALWIS ne sont pas remplacés quand vous créez ce nouvel exemple.
