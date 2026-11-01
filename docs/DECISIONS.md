# Décisions et expériences à mener

> Cadrage actualisé : voir [l’objectif actif](EXECUTION.md). N fenêtres avec sessions indépendantes ou partagées ; WASM unique PHP/MariaDB comme cible principale ; SQL à la demande, conservé jusqu'à la sauvegarde ou la fermeture. Les scénarios à deux joueurs ci-dessous sont des tests, pas une limite produit.

Les décisions de périmètre viennent des demandes utilisateur ; les choix d'implémentation restent à valider par le témoin natif. Voir [le contexte](CONTEXTE.md) pour la chronologie.

| Sujet | Décision ou statut | Validation nécessaire |
|---|---|---|
| Exécution | PHP et MariaDB WASM dans le navigateur, pas de VM x86 | Premier build témoin |
| Compatibilité | PDO + MySQLi compilés, backend SQL commun | Types, erreurs, prepared, transactions, références PHP |
| MySQLi | Extension Zend C directe sur l’API embarquée commune, implémentée ; compléter sa compatibilité par inventaire | Fixtures natives et matrice de conformité ; ne pas annoncer la compatibilité complète |
| Moteurs | Une instance PHP et une MariaDB par projet actif | Verrou, génération, arrêt/reprise |
| Cycle SQL | PHP seul → activation native PDO/MySQLi/console → PHP + MariaDB ; après arrêt, nouveau WASM, aucun rejeu automatique de requête PHP | [Décision et limites](CYCLE-MOTEUR.md) ; démarrage initial et récupération déjà vérifiés, sélecteur de préchauffage non implémenté |
| HTTP | Service Worker routeur, studio propriétaire des Workers | Headers, formulaires, redirections, cookies et sessions |
| Fenêtres clientes | N fenêtres, sessions virtuelles indépendantes ou partagées, même base | Deux joueurs + console sont un scénario, pas une limite ; valider rattachement et déconnexion arbitraires |
| Connexions | Propriétaires distincts PHP/console | Fin d'une requête sans fermer la console |
| Stockage | Cible OPFS sans miroir global ; témoin IDBFS incrémental | POSIX, fsync, quota, crash recovery, performances |
| RAM | Cache/file/résultats/threads/historique bornés | Mesures globales et pics sur scénarios identiques |
| Transport SQL | Réduire JSON/base64 ; buffers typés et curseurs | Exactitude binaire, BIGINT/DECIMAL, sémantique bufferisée |
| Fusion | **Cible principale au jalon 4**, après référence séparée vérifiée et mesurée | ABI commune, PDO, gain/coût total, reprise sur erreur, RAM et disponibilité SQL à la demande |
| Édition web | **CodeMirror 6 + services WASM `php-lsp`, SuperHTML, SWC ou Babel-light** ; définitions jQuery internes invisibles | [Orientation utilisateur et exigences](EDITEUR-CODE.md) ; prototype de complétion et mesures de chargement/déchargement |
| UI SQL | JavaScript, SQL/données/diagramme ; chargement à la demande | DDL exécuté puis schéma relu ; échecs affichés |
| Interface du studio | Six espaces, actions et états définis ; anti-ai-slop prioritaire puis suite better-* demandée par l'utilisateur | [Contrat d'interface](INTERFACE-STUDIO.md) et [revue rendue](INTERFACE-REVIEW-2026-11-01.md) ; journal borné, erreurs réelles, navigation clavier et contrastes vérifiés |
| Dossier PC | Reporté V2 | Permissions, cohérence et conflits externes |
| Réseau entre appareils | Chantier ultérieur avec un hôte unique | Signalisation/transport et reprise |
| WordPress | Compatibilité élargie après les fixtures scolaires | Installation, admin, médias, REST et persistance |
| Boogie | Non identifié | Dépôt ou fichiers du projet nécessaires |

Le contrat C décrit une intention, pas une ABI stable. Les budgets de `config/` ne sont pas appliqués aux moteurs. Les preuves historiques dans `provenance/` ne remplacent pas un nouveau test.
