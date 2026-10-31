# Décisions et expériences à mener

Les décisions de périmètre viennent des demandes utilisateur ; les choix d'implémentation restent à valider par le témoin natif. Voir [le contexte](CONTEXTE.md) pour la chronologie.

| Sujet | Décision ou statut | Validation nécessaire |
|---|---|---|
| Exécution | PHP et MariaDB WASM dans le navigateur, pas de VM x86 | Premier build témoin |
| Compatibilité | PDO + MySQLi compilés, backend SQL commun | Types, erreurs, prepared, transactions, références PHP |
| MySQLi | Comparer adaptation mysqlnd et extension directe ; choix ouvert | Microprototype C, pas deux portages complets |
| Moteurs | Une instance PHP et une MariaDB par projet actif | Verrou, génération, arrêt/reprise |
| HTTP | Service Worker routeur, studio propriétaire des Workers | Headers, formulaires, redirections, cookies et sessions |
| Joueurs | Sessions/cookies virtuels distincts, même base | Deux joueurs + console simultanés |
| Connexions | Propriétaires distincts PHP/console | Fin d'une requête sans fermer la console |
| Stockage | Cible OPFS sans miroir global ; témoin IDBFS incrémental | POSIX, fsync, quota, crash recovery, performances |
| RAM | Cache/file/résultats/threads/historique bornés | Mesures globales et pics sur scénarios identiques |
| Transport SQL | Réduire JSON/base64 ; buffers typés et curseurs | Exactitude binaire, BIGINT/DECIMAL, sémantique bufferisée |
| Fusion | Expérience après la référence séparée | Gain total, coût de build et récupération sur erreur |
| UI SQL | JavaScript, SQL/données/diagramme ; chargement à la demande | DDL exécuté puis schéma relu ; échecs affichés |
| Dossier PC | Reporté V2 | Permissions, cohérence et conflits externes |
| Réseau entre appareils | Chantier ultérieur avec un hôte unique | Signalisation/transport et reprise |
| WordPress | Compatibilité élargie après les fixtures scolaires | Installation, admin, médias, REST et persistance |
| Boogie | Non identifié | Dépôt ou fichiers du projet nécessaires |

Le contrat C décrit une intention, pas une ABI stable. Les budgets de `config/` ne sont pas appliqués aux moteurs. Les preuves historiques dans `provenance/` ne remplacent pas un nouveau test.
