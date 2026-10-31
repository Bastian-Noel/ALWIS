# Guide de reprise

> Cadrage actualisé : voir [l’objectif actif](EXECUTION.md). N fenêtres avec sessions indépendantes ou partagées ; WASM unique PHP/MariaDB comme cible principale ; SQL à la demande et déchargement évalué sur mesures. Les scénarios à deux joueurs ci-dessous sont des tests, pas une limite produit.

Commencer par [CONTEXTE](CONTEXTE.md) et [DECISIONS](DECISIONS.md), consolidés à partir des deux traces de conversation. Les scripts se lancent à la racine du dépôt WASMWebServer.

## Ce que demandait la fin de la conversation

La demande du 30 octobre à 22:01 consistait à mettre le projet au propre et regrouper les références. Celle de 22:13 ajoutait : télécharger les dépôts, mapper le code à reprendre/adapter, structurer un socle et rechercher les difficultés ainsi que les optimisations mémoire.

Cette reconstruction couvre ces deux demandes. Elle ne transforme pas la préparation en promesse d'un environnement PHP déjà exécutable.

## Continuité et limites

Le texte fourni décrit un précédent résultat avec quinze dépôts, cinquante-sept repères et huit tests. Il ne contient pas leurs fichiers exacts. La nouvelle préparation comprend dix-sept dépôts principaux, deux snapshots de sous-modules MariaDB, quatre-vingt-un repères de code et quatorze tests du socle. Les nombres sont nouveaux et vérifiables dans les manifests.

Les sources PHP et Emscripten HEAD servent à l'étude des interfaces, pas automatiquement à compiler la pile du bridge. La compatibilité de départ est celle documentée par le bridge : Sean Morris au commit indiqué dans `native/upstream-versions.json`, Emscripten 6.0.6 et version PHP correspondante. Le runtime JoomEngine est une alternative et épingle un bridge différent : l'assembler à HEAD sans vérification serait une nouvelle hypothèse.

## Reprise effective au 31 octobre 2026

Les deux chaînes amont PHP/PDO/MariaDB ont été compilées et testées en navigateur sur le [run 41197139983](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41197139983). Les résultats exacts et le build original MariaDB non résolu sont détaillés dans [CI-RECEIPT](../engine/baseline/CI-RECEIPT.md). La [cartographie des quatre sources](../engine/baseline/SOURCE-ANALYSIS.md) ferme l'analyse prioritaire du jalon 2, pas les inconnues ABI du jalon 4.

1. Reproduire et vérifier l'original lite4mariadb ; conserver l'échec sans patch et tracer séparément l'inclusion de compatibilité `<ctype.h>` sur un checkout jetable.
2. Exécuter le benchmark navigateur sur l'artifact PHP épinglé ; consigner les temps individuels, la disponibilité des API mémoire, les versions et empreintes.
3. Valider transactions, deux connexions indépendantes, fermeture de requête et console, persistence après reload/arrêt forcé, avant de clôturer le jalon 3.
4. **Passer ensuite au jalon 4 : un seul WASM** avec PHP et MariaDB, PDO branché sur API C commune et SQL initialisé à la demande. Mesurer contre le témoin.
5. Seulement après cette validation, développer MySQLi natif et tester les optimisations mémoire (jalon 5).
6. Enfin construire HTTP, N fenêtres, sessions indépendantes ou partagées, outils JS déchargeables et VFS (jalon 6).

La file et le cache livrés se branchent à cette intégration ; ils ne remplacent ni une API HTTP CGI ni un backend fichiers POSIX.

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
