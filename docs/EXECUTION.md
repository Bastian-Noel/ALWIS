# Objectif actif et preuves de progression

L'objectif complet est un prototype navigateur fonctionnel et mesuré avec **un WASM unique PHP + MariaDB et pont natif**, PDO/MySQLi, N fenêtres et sessions indépendantes ou partagées. Les outils texte/SQL doivent pouvoir avoir des cycles de vie séparés. MariaDB démarre à la demande avec un profil mémoire réduit. Son arrêt à chaud est conditionné à des tests minimaux démontrant un gain utile.

Ce cadrage remplace les anciennes formulations limitant le produit à deux joueurs ou reléguant systématiquement le moteur fusionné à une option de fin de projet. Deux joueurs restent une fixture.

| Jalon | Preuve attendue | État |
|---|---|---|
| 1 Structure/cadrage | Répertoires, responsabilités, identifiants et critères | Structure initiale créée |
| 2 Sources | Matrice épinglée et cartographie du cycle moteur | Cartographie prioritaire consolidée dans `engine/baseline/SOURCE-ANALYSIS.md` ; versions A/B non interchangeables |
| 3 Témoins amont | Compilation PHP et MariaDB, PDO, exécution navigateur, persistance et mesures | PHP et bridge réellement compilés et testés en navigateur sur le run 41197139983 ; MariaDB originale bloquée ; mesures non exécutées (voir `engine/baseline/CI-RECEIPT.md`) |
| 4 Fusion | Un binaire, pont C, PDO, démarrage SQL à la demande, comparaison | Non commencé |
| 5 MySQLi/optimisation | Compatibilité, limites, mesures et décisions | Non commencé |
| 6 Environnement web | N fenêtres/sessions, HTTP, fichiers, outils et reprise | Non commencé |

Les archives et 14 tests JavaScript importés prouvent uniquement la préparation. Les documents historiques et leurs rapports restent des preuves datées. Aucun benchmark moteur chiffré n'a encore été réalisé par WASMWebServer. La CI amont a cependant déjà exécuté PHP et MariaDB réels dans Chromium/Firefox ; voir `engine/baseline/CI-RECEIPT.md` pour les preuves et l'échec du témoin original.

## Conditions d'acceptation

PHP : formulaires GET/POST, cookies et sessions, uploads, en-têtes répétés et redirections. SQL : types exacts, préparations, transactions, connexions/propriétaires indépendants, nettoyage et persistance. Fenêtres : N fenêtres liées à N sessions, partage choisi d'une session, une base commune. Saturation : files et allocations bornées, refus explicite, pas de croissance durable incontrôlée.

Comparer même origine/session virtuelle et sous-domaines avant de fixer le routage. Un Service Worker ne contrôle qu'une origine : la piste sous-domaines nécessite plusieurs inscriptions et une liaison au même moteur. Les gains de déchargement UI ou MariaDB doivent être mesurés, sans assimiler mémoire libérée dans le tas WASM à RAM rendue au navigateur.

Hors premier prototype : dossiers PC, réseau entre appareils et compatibilité WordPress étendue.
