# Couverture PDO et MySQLi

Le prototype vise les appels usuels sans réécriture ; la compatibilité complète n'est pas acquise. La version de référence est PHP 8.4.27. `compatibility-inventory.json`, généré par `python3 scripts/inventory-mysqli.py`, compare les entrées **enregistrées** aux stubs de cette version. Il ne transforme pas une présence en preuve de conformité. À ce jalon, 72/106 fonctions procédurales sont enregistrées.

## Nouveau parcours réel

`fixtures/compatibility/native-coverage.php` est exécuté tel quel par le harness navigateur natif :

- Découverte réelle de `mysqli` et `pdo_mysql` via `extension_loaded`, fonctions de l'extension MySQLi.
- PDO préparé émulé et natif : paramètres nommés, références modifiées, NULL, Unicode, BLOB, fetch objet/key-pair/bound, métadonnées, closeCursor.
- PDO bufferisé et non bufferisé : résultat excessif refusé, puis nouvelle requête réussie sur la même connexion.
- MySQLi init/real_connect, select_db/charset, échappement et aller-retour Unicode/NUL/quotes, informations client/serveur, diagnostics, affected_rows, autocommit/rollback.
- MySQLi requêtes directes et préparées : refus des résultats excessifs et réutilisation de la connexion.
- Itération `foreach`/`getIterator`, fetch_column/lengths, curseur de champs et reset/free/seek/réexécution des statements. Les alias et compteurs/propriétés ne constituent pas une conformité exhaustive.

Le parcours existant conserve transactions, paramètres préparés, bind_result/fetch, types exacts, console indépendante et persistance. Le runtime utilise une extension Zend C directe ; aucune implémentation PHP des fonctions MySQLi n'est substituée.

## Travail restant

Priorités de conformité : options de connexion et classes/propriétés, long-data, options avancées et attributs des statements, multi-query/multi-résultats (dont routines), erreurs/report modes, métadonnées complètes et alias. Les voies asynchrones, sockets distants, réplication et fonctions dépendant de mysqlnd doivent avoir une politique explicite ; leur absence ne doit pas être masquée par des fonctions qui simulent une réussite.

`fetch_object`, `execute_query` et l'initialisation/préparation séparée des statements ont leur parcours vérifié ci-dessous ; leurs variantes et cas limites restent à compléter. La branche PDO externe épinglée renvoie actuellement les scalaires numériques sous forme de chaînes, y compris un SELECT préparé natif : ce comportement ne doit pas être confondu avec les conversions numériques MySQLi ni avec la parité mysqlnd. Les types de retour PDO demandent une matrice dédiée.

PDO réutilise le driver C amont adapté au backend embarqué ; tous ses attributs, types, modes fetch et cas de curseurs ne sont pas pour autant validés. Compléter une matrice sur les tests PHP amont et sur plusieurs applications PHP inchangées reste nécessaire. Aucun test d'installation de phpMyAdmin n'est présenté comme réussi.

Les contraintes de ressources font partie de la compatibilité annoncée : 16 Mio de blocs de résultat embarqué par jeu et 10 000 lignes, entrée SQL 8 Mio, 32 connexions appelantes, registre partagé de 128 handles préparés natifs et 16 Mio de texte de préparation réservé. Pour les grands jeux, la grille demande des pages SQL de 100 lignes. Les limites refusent la requête avec erreur ; elles ne renvoient pas discrètement un résultat tronqué. `native-statement-budget.php` vérifie les refus croisés PDO/MySQLi, la réutilisation après fermeture, la borne de SQL direct/émulé, les reprises et la libération des compteurs par la fin de requête.

L’initialisation installe désormais les définitions officielles des tables système de la même version MariaDB lorsqu’il manque `mysql.proc`. Cette absence bloquait CREATE FUNCTION/PROCEDURE dans le premier runtime ; elle a été reproduite puis corrigée. Les routines, fonctions, vues dépendantes et triggers sont aussi exercés par l’export/restauration du studio. Une exception PHP non interceptée dans une transaction est maintenant vérifiée : rollback, connexion propriétaire libérée et console toujours réutilisable.

## Objets et statements séparés — 1 novembre

`fixtures/compatibility/native-convenience.php` passe sur Chromium et Firefox : `fetch_object()` avec stdClass et classe métier, propriétés avant constructeur, arguments nommés du constructeur, erreur sur classe abstraite, fin et résultat libéré ; `execute_query()` procédural/objet, paramètres binaires/NULL, types natifs, transactions, affected_rows conservé après fermeture du statement temporaire, budget de résultat et récupération ; `stmt_init()`, constructeur `mysqli_stmt`, préparation séparée, repréparation avec nettoyage des références, erreur puis nouvelle préparation réussie et invalidation par fermeture de la connexion. Cinquante appels successifs vérifient la réutilisation du chemin temporaire, sans constituer un test d'endurance. Les handles MySQLi non connectés laissent SQL dormant.
