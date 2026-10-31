# Objectif actif et preuves de progression

L'objectif complet est un prototype navigateur fonctionnel et mesuré avec **un WASM unique PHP + MariaDB et pont natif**, PDO/MySQLi, N fenêtres et sessions indépendantes ou partagées. Les outils texte/SQL doivent pouvoir avoir des cycles de vie séparés. MariaDB démarre à la demande avec un profil mémoire réduit. Son arrêt à chaud est conditionné à des tests minimaux démontrant un gain utile.

Ce cadrage remplace les anciennes formulations limitant le produit à deux joueurs ou reléguant systématiquement le moteur fusionné à une option de fin de projet. Deux joueurs restent une fixture.

| Jalon | Preuve attendue | État |
|---|---|---|
| 1 Structure/cadrage | Répertoires, responsabilités, identifiants et critères | Structure initiale créée |
| 2 Sources | Matrice épinglée et cartographie du cycle moteur | Cartographie prioritaire consolidée dans `engine/baseline/SOURCE-ANALYSIS.md` ; versions A/B non interchangeables |
| 3 Témoins amont | Compilation PHP et MariaDB, PDO, exécution navigateur, persistance et mesures | Trois builds natifs verts (run 41204266390) ; benchmark Chromium/Firefox 3/3 et persistance (run 41212313878) ; PSS globale rapportée et capacités linéaires maintenant instrumentées via copie diagnostique ; reprise après interruption post-flush testée ; limites dans le receipt de reprise |
| 4 Fusion | Un binaire, pont C, PDO, démarrage SQL à la demande, comparaison | Un module principal commun et runtime PDO/MySQLi/fichiers/HTTP validés sur Chromium/Firefox ; comparaison mémoire/performance à compléter |
| 5 MySQLi/optimisation | Compatibilité, limites, mesures et décisions | En cours : extension MySQLi C, préparations et résultats liés exécutés ; 68/106 entrées procédurales enregistrées ; conformité approfondie et profils réduits mesurés ; compatibilité complète ouverte |
| 6 Environnement web | N fenêtres/sessions, HTTP, fichiers, outils et reprise | Prototype fonctionnel : quatre fenêtres/trois sessions, base commune, fichiers, console/grille, schéma, déchargement et sauvegarde/reprise exécutés sur les deux navigateurs |

Les archives et 14 tests JavaScript importés prouvent uniquement la préparation. Les documents historiques et leurs rapports restent des preuves datées. Le premier benchmark navigateur chiffré a réussi (6 échantillons et scénarios SQL/PDO) ; la mémoire physique demeure non instrumentée dans ce banc. La CI amont a cependant déjà exécuté PHP et MariaDB réels dans Chromium/Firefox ; voir `engine/baseline/CI-RECEIPT.md` pour les preuves et l'échec du témoin original.

## Conditions d'acceptation

PHP : formulaires GET/POST, cookies et sessions, uploads, en-têtes répétés et redirections. SQL : types exacts, préparations, transactions, connexions/propriétaires indépendants, nettoyage et persistance. Fenêtres : N fenêtres liées à N sessions, partage choisi d'une session, une base commune. Saturation : files et allocations bornées, refus explicite, pas de croissance durable incontrôlée.

Comparer même origine/session virtuelle et sous-domaines avant de fixer le routage. Un Service Worker ne contrôle qu'une origine : la piste sous-domaines nécessite plusieurs inscriptions et une liaison au même moteur. Les gains de déchargement UI ou MariaDB doivent être mesurés, sans assimiler mémoire libérée dans le tas WASM à RAM rendue au navigateur.

Hors premier prototype : dossiers PC, réseau entre appareils et compatibilité WordPress étendue.

## Reprise locale : état distinct des preuves historiques

Le [receipt du 31 octobre](../benchmarks/REPRISE-2026-10-31.md) décrit les corrections d'isolation du banc, ses 23 tests de socle et la levée des blocages réseau puis la validation réelle des témoins séparés. Les rapports de PSS fournis sont des mesures globales du navigateur ; le moteur fusionné a depuis sa preuve séparée ci-dessous ; la reprise pendant une panne et les mesures résidentes du produit restent ouvertes. Aucun statut CI en direct n'est déduit des tests locaux.

## Tranche fonctionnelle custom C

Le [receipt du runtime C](../engine/fusion/NATIVE-RUNTIME-RECEIPT.md) atteste les fixtures PDO/MySQLi inchangées, fichiers, CGI, HTTP navigateur, console indépendante et reprise après sauvegarde/nouveau propriétaire sur les deux navigateurs. Le [studio](../apps/studio/README.md) apporte maintenant les fenêtres/sessions et outils ; les reçus sont dans `apps/studio/receipts/`. La compatibilité complète et l’isolation par véritables origines restent ouvertes. Le [profil mémoire natif](../benchmarks/native/README.md) et la charge courte sont maintenant mesurés ; l’endurance, les quotas VFS et la reprise en panne restent à approfondir. Ne pas relancer les témoins amont pour une simple modification du runtime custom.
