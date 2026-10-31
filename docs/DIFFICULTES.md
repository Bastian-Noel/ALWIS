# Difficultés, solutions et code custom

Les constats de code renvoient aux repères de [CODE-MAP.md](CODE-MAP.md), tous épinglés. Les solutions ci-dessous sont un plan d'implémentation, sauf le cache et la file explicitement livrés.

| Difficulté | Constat / point de code | Solution proposée | Validation décisive |
|---|---|---|---|
| Assemblage de versions | SRC-029 et SRC-053 : Sean Morris/SDK et bridge épinglés séparément | Verrou de build distinct du verrou des références ; premier build sans optimisation | Tests amont PHP/SQL réussis avec manifests d'assets correspondants |
| MySQLi natif sans serveur TCP | SRC-039 à 046 : références internes mysqlnd, résultats et statements | Spike d'interposition des tables mysqlnd puis comparaison à adaptation directe MySQLi | `mysqli_connect`, requêtes objet/procédurales, prepare/bind/execute/get_result sans shim PHP |
| `bind_param` par référence | SRC-040 | Garder les références Zend et lire leur valeur à chaque execute | Variable modifiée après bind ; exécutions répétées et NULL |
| Deux pilotes PDO `mysql` | SRC-019 | Compiler un seul fournisseur du nom `mysql` dans le profil cible | Liste PDO drivers, DSN et erreurs non ambiguës |
| JSON et base64 | SRC-014/015/020/021/035 | ABI C typée ; transport séparé binaire longueur+offset ; fusion par appel C direct | Équivalence binaire exacte et mémoire maximale mesurée |
| Résultats bufferisés avant transport | SRC-033 utilise `mysql_store_result` | Étudier `mysql_use_result`/curseur embarqué ; spool OPFS pour mode bufferisé si nécessaire | Gros résultat, fetch partiel, free_result précoce et data_seek |
| Surcoût par petite requête | SRC-020 : SET NAMES, lecture sql_mode, requête utile, statut | Mettre en cache ce qui reste correct ; exploiter métadonnées C natives | Requêtes qui modifient sql_mode/charset/LAST_INSERT_ID gardent leur effet |
| Perte de BIGINT/DECIMAL | Chaîne SQL→JSON→JS Number à éviter | Texte décimal ou int64/uint64 typé ; jamais conversion silencieuse | Fixtures 2^64−1 et DECIMAL(20,6), limites signées/non signées |
| Binaire, NULL et encodage | SRC-017/021, restrictions BIT/GEOMETRY dans engine.mjs | Cellules à longueur explicite, tags NULL/binaire, métadonnées charset | Octets 00/FF, emoji, vide vs NULL, colonnes homonymes et BIT |
| Connexion console fermée après PHP | SRC-022 : reset parcourt toutes les connexions | Registre ownerId+génération ; RSHUTDOWN ferme seulement l'owner PHP | Console reste connectée ; transaction PHP abandonnée est annulée |
| Limites de sessions | Patch actuel : 32 sessions supplémentaires | Petit pool plafonné, pas de connexion globale partagée entre transactions | Deux connexions : commit/rollback isolés, limite propre et sans fuite |
| COMMIT ≠ sauvegarde navigateur | SRC-024 et SRC-037 | Sérialiser checkpoint moteur puis flush VFS, ACK après réussite | Redémarrage puis arrêt forcé, intégrité et dernières écritures garanties définies |
| IDBFS duplique le datadir en RAM | SRC-036 | Prototype WasmFS OPFS ; conserver IDBFS comme témoin | Base 10/100/500 Mio ; croissance mémoire sans miroir proportionnel |
| OPFS pas plug-and-play | SRC-056 à 059 | Recompiler et tester opérations POSIX attendues, erreurs partielles et quota | read/write offsets, rename/unlink sur fichier ouvert, truncate, flush et reprise InnoDB |
| OPFS pas toujours plus rapide | SRC-011/012 | Refaire les essais avec notre petite application, cache borné et même persistance | Froid/chaud, pic mémoire, p50/p95 et coût par fichier |
| Adaptateur VFS avec cache implicite | SRC-060 à 065 : WebAccessFS indexe ; readFile alloue le fichier entier | Vérifier caches/préchargements ; préférer descripteurs et blocs | Médias de 100 Mio et milliers de fichiers sans double miroir |
| Pthreads et deadlocks de proxy | SRC-027/031/057 | Garder corrections de yield ; réduire le pool par paliers après test | Démarrage, checkpoint, concurrence, arrêt et timeout sans blocage |
| Croissance mémoire WASM | SRC-032 | Renouveler les vues HEAP après growth ; pas de pointeur nu entre modules | Forcer une croissance entre deux fetch et relire les résultats |
| Suspension PHP asynchrone | SRC-026 et runtime | Aligner SDK, Asyncify ou JSPI et extensions ; pas d'appel bloquant au thread UI | SQL/fichiers répétés, exceptions et requêtes interrompues |
| SW redémarré / propriétaire disparu | SRC-047 à 050 | Registre dans studio, reconnexion et génération ; erreur bornée si absent | Redémarrage SW pendant navigation, fermeture/réouverture studio |
| Deux studios concurrents | Verrou exclusif par projectId | Web Locks ; second studio rejoint le propriétaire | Deux ouvertures simultanées n'ouvrent jamais deux datadirs écrivains |
| Cookies partagés entre joueurs | SRC-051 | Cookie jar virtuel par sessionId et injection CGI | Connexions utilisateurs différentes, redirections, Path, expires, uploads |
| Fast polling et saturation | File PHP mono-exécution | Admission bornée, une requête en vol par joueur, pause onglet masqué | 20 requêtes/s au total, puis surcharge contrôlée sans file qui croît |
| PHP infini / timeout | Annuler un Promise n'interrompt pas du WASM synchrone | Hook coopératif natif ou terminaison Worker et procédure de reprise DB | Boucle infinie : UI répond ; aucune seconde requête ne chevauche la première |
| Imports ZIP/SQL volumineux | SQL contient ; dans chaînes, routines, commentaires | Décompression en flux bornée et parseur/importeur réel, annulation et progression | Dump avec DELIMITER, BLOB, commentaires versionnés, reprise après erreur |
| Éditeur relationnel déconnecté du moteur | SRC-069 à 079 | Introspection comme source de vérité ; gestes → SQL → relecture | FK composite, type incompatible, données orphelines, DDL externe |
| DDL non annulable par transaction UI | CREATE/ALTER peuvent provoquer commits implicites | Prévisualiser SQL, exporter avant action destructive et conserver l'erreur | Échec ALTER laisse UI alignée sur l'état réel |
| Grille et modifications concurrentes | SRC-075 à 077 | Pagination et PK composite, update conditionnel sur version/ancienne valeur | Aucune mise à jour globale de lignes homonymes ; conflit visible |
| Build fusionné | Deux runtimes avec options/allocateurs potentiellement divergents | Même SDK et ABI ; un seul propriétaire d'allocation/libération ; conserver référence séparée | Comparaison sur mêmes fixtures et crash/reprise complète |
| Mémoire JS hors heap WASM | Objets, résultats UI, closures de requêtes, ports et Workers | Budgets par catégorie, écouteurs retirés, historique plafonné, chargement UI différé | Longue session, ouverture/fermeture de fenêtres, mémoire stable après repos |

## Choix de développement custom

Le noyau spécifique sera composé de cinq éléments : coordination propriétaire/sessions, adaptation MySQLi native, contrat SQL et transport typé, backend VFS cohérent avec la persistance, et réconciliation du schéma UI. Les projets amont fournissent des références concrètes pour chacun, sans fournir déjà leur assemblage final.

Les priorités mémoire sont l'absence de miroir global et la réduction des buffers. L'optimisation des microcopies ne doit pas masquer un `mysql_store_result` qui retient tout un résultat ou une seconde instance de moteur dans une fenêtre SQL.
