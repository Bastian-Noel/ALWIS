# JoomEngine → ALWIS : idées techniques étudiées, décisions et limites

**Références fixes étudiées :** [PHP-WASM `3b8cef42`](https://github.com/joomengine/php-wasm/commit/3b8cef42c020fbcbb6b41fad86716b7c8664b55b), [MariaDB bridge `56d47b4d`](https://github.com/joomengine/mariadb-wasm-bridge/commit/56d47b4dc867af313592efa09e12df470a36e129), leurs métadonnées sauvegardées dans `provenance/joomengine--*.commit.json` et la source GPLv2 en option [Sean Morris `1e1fb670`](https://github.com/seanmorris/php-wasm/tree/1e1fb6703730759181e84c62bce35ee9129febb9). Les descriptions ici concernent des **comportements**, pas des extraits de code à copier. Les changements récents de l'amont ne sont pas supposés intégrables sans vérification.

| Idée constatée / besoin ALWIS | Décision ALWIS | État |
|---|---|---|
| PHP 8.4 compilé en WASM via Emscripten, cycle de requêtes isolées | Garder PHP 8.4.27 et écrire notre SAPI/HTTP indépendante ; comparaison contre l'ancien binaire | Runner source candidat, non lié |
| Asyncify pour reprendre PHP après un appel navigateur | Continuer d'utiliser les API réseau ALWIS et les bibliothèques natives, sans importer le pont SQL séparé | Infrastructure ancienne présente ; cURL Fetch restant |
| Echanges PHP avec un worker MariaDB par hôte `mariadb.v1` | **Ne pas reprendre** : ALWIS utilise PHP+MariaDB dans un WASM et PDO/MySQLi directs. Le pont JoomEngine couvre PDO et des préparations émulées, sans compatibilité MySQLi complète dans la référence étudiée | Décision d'architecture validée |
| Gestion des connexions et rollback à la fin d'une requête | `pbl_mysql_owner_begin/cleanup`, registre de connexions et fermeture après les destructeurs PHP | Code ALWIS existant ; à revalider avec le runner |
| Adaptation des attentes de threads InnoDB / checkpoints à Emscripten | Remplacer les points d'attente par une implémentation ALWIS indépendante, sous contrôle de SHA et d'ancres C ; ne pas importer `l4m_session_*` | Source candidat + 9 tests statiques ; binaire non revalidé |
| Limites mémoire, quotas réseau, échec clair et reprise de l'exécution | Budgets 8 Mio, requêtes sérialisées, contrôle de débit HTTP invité et annulation sans rejouer POST | Modules ALWIS présents ; tests navigateurs à compléter |
| Reçus de tests avec hash de l'artefact et provenance source | Matrice unique de 17 scénarios, empreintes exactes, source bundle et garde bloquante de redistribution | 17 scénarios **historiques** passés dans Chromium/Firefox ; candidat non testé |
| Persistance des fichiers et SQL après reprise | Continuer propriétaire exclusif, IDBFS/OPFS + snapshot SQL et récupération atomique ALWIS | Témoin testé ; nouveau binaire non testé |
| Réseau HTTP et cURL via le navigateur | Réutiliser Fetch comme transport possible, tout en conservant statuts, headers, binaire, redirects, limites et erreurs PHP | Après parité : pas de cURL complet revendiqué |

## Contraste essentiel

L'approche du pont SQL JoomEngine simplifie le lien entre deux modules mais ne conserve pas automatiquement les appels natifs MySQLi et les prepared statements du runtime ALWIS. Réécrire simultanément PHP, MariaDB, le protocole SQL et les sauvegardes est donc exclu pour la migration actuelle. L'aperçu invité HTTP est une **architecture ALWIS distincte** : seule la machine hôte exécute PHP/SQL ; chaque navigateur invité reçoit des réponses HTTP et exécute le JavaScript de son site sous isolation, sans copie du DOM de l'hôte.

## Licence et méthode

L'archive Sean Morris vérifiée offre une option GPLv2 sur les parties couvertes, sans transférer cette licence aux modifications propres à JoomEngine. La publication du runtime combiné doit prouver les droits sur **chaque source effectivement liée**, pas simplement éviter un copier-coller. Les mécanismes étudiés sont décrits fonctionnellement ; un audit humain reste nécessaire sur la provenance, les adaptations et l'artefact compilé. Voir `provenance/release-licensing-status.json` et `provenance/component-license-map.md` : **publication bloquée**.
