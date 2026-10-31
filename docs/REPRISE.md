# Guide de reprise

> Cadrage actualisé : voir [l’objectif actif](EXECUTION.md). N fenêtres avec sessions indépendantes ou partagées ; WASM unique PHP/MariaDB comme cible principale ; SQL à la demande et déchargement évalué sur mesures. Les scénarios à deux joueurs ci-dessous sont des tests, pas une limite produit.

Commencer par [CONTEXTE](CONTEXTE.md) et [DECISIONS](DECISIONS.md), consolidés à partir des deux traces de conversation. Les scripts se lancent à la racine du dépôt WASMWebServer.

## Ce que demandait la fin de la conversation

La demande du 30 octobre à 22:01 consistait à mettre le projet au propre et regrouper les références. Celle de 22:13 ajoutait : télécharger les dépôts, mapper le code à reprendre/adapter, structurer un socle et rechercher les difficultés ainsi que les optimisations mémoire.

Cette reconstruction couvre ces deux demandes. Elle ne transforme pas la préparation en promesse d'un environnement PHP déjà exécutable.

## Continuité et limites

Le texte fourni décrit un précédent résultat avec quinze dépôts, cinquante-sept repères et huit tests. Il ne contient pas leurs fichiers exacts. La nouvelle préparation comprend dix-sept dépôts principaux, deux snapshots de sous-modules MariaDB, quatre-vingt-un repères de code et quatorze tests du socle. Les nombres sont nouveaux et vérifiables dans les manifests.

Les sources PHP et Emscripten HEAD servent à l'étude des interfaces, pas automatiquement à compiler la pile du bridge. La compatibilité de départ est celle documentée par le bridge : Sean Morris au commit indiqué dans `native/upstream-versions.json`, Emscripten 6.0.6 et version PHP correspondante. Le runtime JoomEngine est une alternative et épingle un bridge différent : l'assembler à HEAD sans vérification serait une nouvelle hypothèse.

## Première tranche après cette préparation

1. Sur un poste possédant la chaîne native, conserver les snapshots d'origine et travailler dans des copies.
2. Reproduire le test amont PDO PHP+MariaDB du bridge avec son patch de sessions indépendantes. Ne pas commencer par modifier sa mémoire ou son ABI.
3. Mesurer mémoire, démarrage et requête PHP scolaire ; sauvegarder le résultat brut avec navigateur, OS, CPU et commits.
4. Séparer le nettoyage de fin de requête PHP des connexions console. Tester rollback et fermeture des curseurs du seul propriétaire concerné.
5. Décider entre adaptation mysqlnd et adaptation de MySQLi au backend commun sur la base d'un microprototype C ; ne pas implémenter les deux intégralement.
6. Ajouter MySQLi natif, puis comparer les sorties des fixtures PDO et MySQLi.

La file et le cache livrés se branchent à cette intégration ; ils ne remplacent ni l'API HTTP CGI du runtime, ni un backend fichiers POSIX.

## Critères de réussite inchangés

- Projet scolaire importé sans modifier ses appels PDO/MySQLi courants.
- Formulaires, cookies, sessions, uploads, en-têtes répétés et redirections servis correctement.
- Deux joueurs virtuels à 5 puis 10 requêtes/s chacun, une requête en vol par joueur, sans croissance durable de la file.
- Console SQL dans une autre fenêtre, même base, connexion indépendante.
- Sauvegarde explicite puis restauration vérifiée après fermeture et interruption.
- RAM mesurée et expliquée ; viser moins de 300 Mio sur une petite fixture reste un objectif, pas un acquis.
- WordPress simple seulement après ces étapes ; le succès de Playground avec SQLite ne prouve pas la compatibilité MariaDB/MySQLi de notre montage.

## Sauvegardes livrées

Le dépôt contient les documents, modules, tests, fixtures, scripts et verrous du petit ZIP. La release `sources-2026-10-31` conserve les 19 archives amont vérifiées. Voir [IMPORT](IMPORT.md) pour les empreintes originales, le reconditionnement et la restauration.
