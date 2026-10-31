# Couverture PDO et MySQLi

Le prototype vise les appels usuels sans réécriture ; la compatibilité complète n'est pas acquise. La version de référence est PHP 8.4.27. `compatibility-inventory.json`, généré par `python3 scripts/inventory-mysqli.py`, compare les entrées **enregistrées** aux stubs de cette version. Il ne transforme pas une présence en preuve de conformité. À ce jalon, 44/106 fonctions procédurales sont enregistrées.

## Nouveau parcours réel

`fixtures/compatibility/native-coverage.php` est exécuté tel quel par le harness navigateur natif :

- Découverte réelle de `mysqli` et `pdo_mysql` via `extension_loaded`, fonctions de l'extension MySQLi.
- PDO préparé émulé et natif : paramètres nommés, références modifiées, NULL, Unicode, BLOB, fetch objet/key-pair/bound, métadonnées, closeCursor.
- PDO bufferisé et non bufferisé : résultat excessif refusé, puis nouvelle requête réussie sur la même connexion.
- MySQLi init/real_connect, select_db/charset, échappement et aller-retour Unicode/NUL/quotes, informations client/serveur, diagnostics, affected_rows, autocommit/rollback.
- MySQLi requêtes directes et préparées : refus des résultats excessifs et réutilisation de la connexion.

Le parcours existant conserve transactions, paramètres préparés, bind_result/fetch, types exacts, console indépendante et persistance. Le runtime utilise une extension Zend C directe ; aucune implémentation PHP des fonctions MySQLi n'est substituée.

## Travail restant

Priorités de conformité : options de connexion et classes/propriétés, itération des résultats et fetch_object, long-data, reset/free/seek des statements, multi-query/multi-résultats (dont routines), erreurs/report modes, métadonnées complètes et alias. Les voies asynchrones, sockets distants, réplication et fonctions dépendant de mysqlnd doivent avoir une politique explicite ; leur absence ne doit pas être masquée par des fonctions qui simulent une réussite.

PDO réutilise le driver C amont adapté au backend embarqué ; tous ses attributs, types, modes fetch et cas de curseurs ne sont pas pour autant validés. Compléter une matrice sur les tests PHP amont et sur plusieurs applications PHP inchangées reste nécessaire. Aucun test d'installation de phpMyAdmin n'est présenté comme réussi.

Les contraintes de ressources font partie de la compatibilité annoncée : 16 Mio de blocs de résultat embarqué par jeu et 10 000 lignes, entrée SQL 8 Mio, 32 connexions appelantes. Pour les grands jeux, la grille demande des pages SQL de 100 lignes. Les limites refusent la requête avec erreur ; elles ne renvoient pas discrètement un résultat tronqué.
