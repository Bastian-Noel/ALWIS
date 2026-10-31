# Mémoire et protocole de mesure

## Constats vérifiés dans les sources

| Paramètre | Amont lite4mariadb épinglé | Patch du bridge épinglé | Repère |
|---|---:|---:|---|
| Mémoire linéaire initiale | 256 Mio | inchangée dans le patch | SRC-030 |
| Maximum linéaire | 2 Gio | inchangé dans le patch | SRC-032 |
| Pile Emscripten principale | 2 Mio | inchangée dans le patch | `wasm/CMakeLists.txt` |
| Pool pthread initial | 16 | 16, politique stricte modifiée | SRC-031/027 |
| Buffer pool InnoDB initial | 16 Mio | 64 Mio | SRC-034/027 |
| Limite pool InnoDB annoncée aux options | 16 Mio | 256 Mio, option `loose` | SRC-034/027 |
| Sessions supplémentaires | non exposées par ABI d'origine | 32 slots | patch `independent-sessions.patch` |
| Résultat C | `mysql_store_result` | API JSON conservée | SRC-033 |
| Stockage navigateur | IDBFS, miroir en mémoire | checkpoint puis persist | SRC-036/024 |

Les pthreads partagent la mémoire linéaire : il ne faut pas multiplier 256 Mio par 16. La pile fait partie de l'espace linéaire et ne doit pas être ajoutée une seconde fois à ce total. Taille allouée, mémoire résidente et mémoire du processus navigateur sont trois mesures différentes.

## Cibles de conception, non mesures

| Poste | Paramètre d'essai |
|---|---|
| Cache sources | 4 Mio, 1024 entrées, pas de cache des gros fichiers |
| Queue HTTP | 32 attentes max, 8 Mio de corps admis actifs+en attente |
| Bloc résultat SQL | 256 Kio / 256 lignes au maximum, cellule hors budget rejetée explicitement |
| Pagination console | 100 lignes, plafond taille cellule/historique |
| Buffer pool InnoDB | comparer 16 et 32 Mio au témoin 64 Mio patché |
| Pool pthread | comparer 16, 8 puis 4 seulement si le moteur démarre et reste correct |
| Mémoire initiale MariaDB | comparer 256, 128, 96, 64 Mio ; ne pas supposer les plus petites fonctionnelles |
| Objectif produit | < 300 Mio sur petite fixture, à préciser par métrique et navigateur |

`config/memory-profiles.json` ne change pas les builds amont. Ses valeurs sont des entrées d'expérience. La réussite des tests JavaScript n'atteste aucune de ces cibles natives.

L'ancien échange évoquait environ 200–350 Mo pour un petit usage optimisé, et davantage avec les builds bruts. Ces enveloppes restent des estimations historiques. Aucun résultat RAM n'a été mesuré dans cette reconstruction.

## Ordre des optimisations

1. Une seule paire PHP/MariaDB par projet ; fenêtres clientes supplémentaires légères.
2. Éviter le datadir et les sources entièrement dupliqués dans MEMFS/JS.
3. Borner résultats, curseurs, connexions, uploads, files et métadonnées de fichiers.
4. Réduire buffers InnoDB et temporaires MariaDB ; inspecter allocations globales et par connexion.
5. Réduire les pthreads et la mémoire initiale après tests fonctionnels et de reprise.
6. Remplacer JSON/base64 et les requêtes SQL auxiliaires inutiles ; comparer le build fusionné.
7. Charger CodeMirror/grille/diagramme uniquement à leur ouverture.

Une mémoire WASM qui a grandi ne rétrécit généralement pas au simple free des objets. Mesurer le pic et le coût de redémarrer proprement un moteur devenu trop gros ; ne pas confondre absence de fuite et réduction immédiate du heap.

## Mesures à collecter

Pour chaque run, enregistrer date, commits, hashes des JS/WASM, options de build, OS/CPU/RAM, navigateur/version, état d'isolation et métrique mémoire exacte. Définir froid (profil/cache vierge) et chaud (assets et DB prêts). Ne pas comparer deux variantes pendant une compilation ou une compression concurrente.

| Scénario | Taille/charge | Mesures |
|---|---|---|
| Studio vide | moteurs démarrés, aucune UI SQL | temps download/compile/startup et repos |
| Import projet | 100/1000/10000 petits fichiers ; média 100 Mio | pic JS/WASM, copies et débit d'import |
| Base | 1/10/100/500 Mio disque | mémoire au repos, après lectures, checkpoint et reprise |
| Page PHP | 1/10/100 requêtes SQL, petits résultats | latence de bout en bout, p50/p95 et durée file |
| Résultats | 100/10000/100000 lignes ; gros BLOB | pic moteur/transport/PHP/UI, free_result et fetch partiel |
| Deux joueurs | 5 puis 10 Hz chacun pendant 10 min | mémoire, erreurs, file, latence p95, sessions distinctes |
| Surcharge | doubler progressivement le débit | refus 503 bornés ; pas de croissance indéfinie |
| Fenêtres | ajouter/fermer console et diagramme | surcoût incrémental, nombre de moteurs inchangé |
| Durabilité | flush réussi puis arrêt forcé | données retrouvées, intégrité et temps de récupération |
| Longue session | plusieurs cycles import/requêtes/fenêtres | pente mémoire après repos et ressources non libérées |

La taille `WebAssembly.Memory.buffer.byteLength` est utile mais n'est pas la RAM résidente. Utiliser les outils du navigateur et du processus pour la mesure complète. Les API de mesure mémoire disponibles varient : documenter ce qui est réellement mesuré et éviter d'additionner des mesures de processus qui partagent des pages.

## Polling : calcul de charge

Pour une file mono-exécution, occupation approchée = débit total × durée moyenne par requête. Deux joueurs à 10 Hz = 20 requêtes/s. À 15 ms par requête, cela donne 30 % théoriques ; à 50 ms, 100 % sans marge. Ce sont des calculs, pas des benchmarks.

L'objectif est une file stable avec de la marge, des requêtes courtes, un index de partie et une seule requête en vol par joueur. La fixture ferme la session PHP avant SQL. En arrière-plan, ralentir ; après une notification locale d'écriture, une lecture utile peut remplacer plusieurs polls à vide.

## Comparaison de variantes

Conserver les mêmes données et critères de durabilité pour : référence séparée+IDBFS, IDBFS incrémental, OPFS, puis fusion. Un flush différé ne doit pas être comparé à une persistance attendue par requête sans le signaler. Répéter au moins cinq exécutions indépendantes, garder les bruts et rapporter dispersion et échecs. Les résultats du dépôt Sean Morris sont une source de méthode, pas des performances de notre futur produit.
