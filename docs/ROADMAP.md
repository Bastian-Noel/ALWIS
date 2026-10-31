# Étapes d'implémentation

> Ordre impératif : [objectif actif](EXECUTION.md). N fenêtres peuvent partager ou non une session ; la fusion PHP/MariaDB est la **cible principale**, pas un lot reporté après l'UI. La mesure précède chaque optimisation.

Une étape n'est close qu'avec des tests réels, des commandes reproductibles, des résultats bruts et les limitations consignées. Les anciens lots 0–11 étaient un inventaire technique, non l'ordre d'exécution actuel.

| Jalon | Travail | Preuve de sortie | État au 31 octobre 2026 |
|---|---|---|---|
| **1 — Cadrage/structure** | Responsabilités natives, runtime, UI, fixtures, CI, provenance et snapshots préservés | Arborescence, sources/verrous, objectif corrigé | Fait pour le socle |
| **2 — Analyse des sources** | Sean Morris PHP, JoomEngine PHP, bridge MariaDB, lite4mariadb ; ABI, compilation et cycles de vie | [Analyse épinglée](../engine/baseline/SOURCE-ANALYSIS.md) et cartographie 81 repères | Analyse initiale complète ; vérifications de fusion à poursuivre au besoin |
| **3 — Témoins amont mesurés** | PHP seul, MariaDB seule, PHP/PDO→MariaDB avec versions amont ; navigateur et persistance | Compile, requêtes et transactions réelles, logs, hashes, temps et RAM documentée | Trois builds réussis, 6 échantillons navigateur et persistance vérifiée ; **mesure RAM manquante**, étape non entièrement close |
| **4 — WASM unique + PDO** | Rebuild ABI commune, runtime unique PHP/MariaDB, pont C direct, owners, SQL à la demande | Même fixtures + comparer mémoire, CPU et persistance au témoin 3 | **Analyse du WASM compilé entamée** ; fusion et pont natif non compilés |
| **5 — MySQLi natif + mémoire** | Spike mysqlnd/extension native, types/résultats, profils MariaDB et cycles stop/restart expérimentaux | Conformité PDO/MySQLi, trace allocateurs/pics navigateur ; décisions fondées sur les chiffres | Non commencé |
| **6 — Environnement navigateur** | Routage HTTP, N fenêtres, sessions virtuelles partagées/indépendantes, persistance fichiers, éditeur et SQL UI déchargeables | GET/POST/cookies/uploads/redirections, même DB, sessions correctes, sauvegarde/reprise et UI démontée | Non commencé |

### Sous-lots à traiter au jalon correspondant

- **4 :** modèle de propriétaire par requête/console, rollback et nettoyage ciblés, file bornée, résultats typés, contrôles des buffers, pont C sans JSON/base64.
- **5 :** MySQLi procédural/objet et prepared, taille de résultat, `mysql_store_result`, profil 16/32/64 Mio, pthreads, stop SQL à chaud seulement si gain navigateur mesuré.
- **6 :** HTTP CGI réel et Service Worker, isolation de cookie jar virtuel / origine / sous-domaines à comparer, options de stockage IDBFS/OPFS avec crash recovery, grille SQL paginée et diagramme introspecté.
- **Après prototype :** accès direct aux dossiers PC, réseau entre appareils, WordPress étendu. Pas de compatibilité affirmée sans test.

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
