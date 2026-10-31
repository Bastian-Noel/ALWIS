# Contrat natif SQL

`include/pbl_sql.h` est une proposition d'interface C, pas une bibliothèque implémentée. Les déclarations n'ont pas de définitions ; aucun `PDO` ou `MySQLi` fonctionnel n'est livré par ce fichier.

À développer : backend libmariadbd, registre owner/génération, ressources statements/curseurs, intégration PDO, adaptation MySQLi/mysqlnd, export JS et transport inter-Worker. Chaque sortie allouée doit avoir un propriétaire et une libération explicites. En mode séparé, convertir les valeurs en frames ; ne jamais envoyer directement une adresse C au module distant. Préserver les métadonnées MariaDB complètes (types serveur, flags, charset, taille, scale) dans la prochaine révision du contrat pour couvrir les API PDO/MySQLi.

Le mode bufferisé complet et `data_seek` demandent un plafond ou un spool persistant. Le mode par lots ne suffit pas à les implémenter. Les prepared statements doivent être testés sur l'API embarquée avant d'être annoncés disponibles.
