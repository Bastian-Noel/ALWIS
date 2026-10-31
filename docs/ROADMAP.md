# Étapes d'implémentation

Chaque étape produit un résultat observable avant de commencer l'optimisation suivante. Les modules listés comme futurs ne sont pas créés artificiellement avec de faux retours.

| Lot | Travail | Références | Critère de sortie |
|---|---|---|---|
| 0 — Reconstitution | Sources, lock, cartographie, cache, file, contrat et fixtures | Livré ici | Tests Node et contrôles d'intégrité verts |
| 1 — Build témoin | SDK 6.0.6, dépendances, PHP Sean Morris et PDO du bridge, MariaDB patchée | SRC-026 à 029, docs BUILD | Test natif amont reproduit, version+hash de chaque asset archivés |
| 2 — Petit projet HTTP | Adapter CGI, document root, GET/POST, cookies, sessions, fichiers, import SQL | SRC-001 à 010, 047 à 052 | Fixture PDO servie en HTTP, rechargement cohérent |
| 3 — Sessions SQL par propriétaire | Owner registry, cleanup ciblé et rollback en fin de requête | SRC-022/023 | Console inchangée après 1000 requêtes PHP et erreurs/abandons |
| 4 — MySQLi natif | Spike mysqlnd vs extension directe, cœur SQL commun, types et prepared | SRC-039 à 046 | PDO/MySQLi fixtures identiques, références bind et fermeture correctes |
| 5 — Transport borné | Curseurs, batches typés, suppression JSON/base64, limites mode bufferisé | SRC-014 à 021, 033/035 | Binaire/types exacts, gros résultat borné ou refus propre |
| 6 — Stockage | Témoin IDBFS incrémental et prototype WasmFS OPFS PHP/DB | SRC-008 à 012, 036/037, 056 à 066 | Persistance et crash recovery ; absence de miroir complet démontrée |
| 7 — Plusieurs fenêtres | Verrou projet, génération, SW routeur, sessions joueurs, reconnexion | SRC-047 à 052, 067/068 | 2 joueurs + console, même DB, fermeture studio et redémarrage SW gérés |
| 8 — Gestion SQL JS | Console, grille paginée, introspection, diagramme et DDL vérifié | SRC-069 à 081 | FK réelle créée depuis diagramme ; erreur DDL reflétée correctement |
| 9 — Profil mémoire | Pools/threads/init heap/caches, imports et historique bornés | docs MEMOIRE | Mesures comparables et rapport des limites par navigateur |
| 10 — Fusion | Lier PHP+MariaDB via API C commune, même jeu de tests | Contrat `pbl_sql.h` | Gain total démontré ou abandon documenté en faveur de la référence |
| 11 — Compatibilité élargie | WordPress simple, médias, REST/permalinks, quelques extensions | Projet réel | Install/admin/article/upload/persistance réussis sur notre MariaDB |

## Backlog de tests natifs

- PDO/MySQLi procédural et objet : DSN/charset, erreurs, insert ID, affected rows, métadonnées.
- NULL, chaîne vide, Unicode, BLOB avec NUL/FF, BIGINT/DECIMAL, colonnes homonymes.
- Prepare/execute répétés, bind par référence, get_result, bind_result, fetch/seek/free.
- Deux connexions, transactions, autocommit, rollback sur exception et abandon, état SQL par connexion.
- Requêtes qui changent SQL_MODE/charset, batch de résultats et multi-statements explicitement pris en charge ou rejetés.
- Import SQL avec commentaires versionnés, routines et séparateurs ; aucune découpe naïve.
- Propriétaire unique, stale messages, ports fermés, timeout, arrêt de Worker et reprise.
- Fichiers : écritures courtes, fermeture, rename/unlink ouverts, fsync, quota, données corrompues, récupération.

## Fonctionnalités reportées

Ouvrir un dossier PC, détecter ses modifications et gérer les conflits reste V2. WebRTC entre deux appareils, signalisation/TURN et politique d'hôte restent un chantier distinct. Pas de réplication SQL multi-maître. Pas de VM x86. Pas d'objectif de jeu d'action temps réel à 60 traitements PHP/SQL par seconde et par joueur.

Les estimations de jours/semaines de l'ancienne discussion sur le dossier PC ne sont pas un planning de livraison de toute cette pile. Établir une estimation après les spikes MySQLi et VFS, les deux principales inconnues.
