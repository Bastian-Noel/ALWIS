# Performance : mesures et protocole


## Profils de performance et choix conseillé — 1 novembre 2026

## Ce qui existe réellement

Il n'existe pas encore de sélecteur de profils dans le studio. Le moteur actuel utilise **un profil réduit**, avec activation SQL et chargement des Workers à la demande. Les profils `original`, `pthread-2m`, `bounded-server`, `system-tables` et `statement-cleanup` sont des révisions/expériences archivées, pas cinq options interchangeables à proposer aux utilisateurs. Leurs binaires et fonctionnalités ont évolué ; ils ne sont pas des choix équivalents d'une même version.

| Mode actuel | Déclenchement | Conséquence |
|---|---|---|
| Interface seule | Aucun projet ouvert | Pas de moteur de projet démarré ; consommation non mesurée séparément |
| PHP seul | Projet ouvert, aucun besoin SQL | Un Worker moteur ; aucun Worker pthread SQL auxiliaire, MariaDB non initialisée |
| PHP + MariaDB | Première connexion PDO MySQL/MySQLi ou console SQL | Même WASM, même requête PHP, pool auxiliaire de 16 chargé une fois ; 15 utilisés au pic observé |
| Outil en veille | Ressources → En veille | Interface conservée et contrôles désactivés ; aucune économie RAM démontrée |
| Outil déchargé | Ressources → Déchargé | Brouillon conservé, DOM et modèles d'outil retirés ; connexion console fermée si SQL, transaction non validée annulée ; économie totale non quantifiée |

Décharger un outil ne retire pas ses fonctions JavaScript déjà chargées du module principal du studio. Fermer la console ne coupe pas MariaDB utilisée par PHP. La sauvegarde arrête SQL proprement et recrée le moteur ; la première connexion suivante réactive SQL. Aucun redémarrage SQL dans le même WASM arrêté, aucun rejeu automatique de POST.

## Mesures du binaire actuel, refaites pour ce bilan

Un navigateur neuf par exécution, Chromium 156.0.8078.4 et Firefox 157.0 sous Linux. Le protocole crée un runtime, exécute PHP seul, initialise SQL, crée 1 000 lignes et mesure 100 requêtes `COUNT(*)`. PSS globale = ensemble des processus descendants du test Playwright ; elle inclut navigateur, JS/JIT, Workers, WASM et VFS. Il ne s'agit ni de la seule RAM du moteur ni d'un pic continu.

| Mesure | Chromium | Firefox |
|---|---:|---:|
| Capacité WASM, PHP seul / SQL actif | 256 / 256 Mio | 256 / 256 Mio |
| RAM globale PSS, PHP seul | **278,93 Mio** | **617,85 Mio** |
| RAM globale PSS, SQL au travail | **542,41 Mio** | **758,26 Mio** |
| Allocateur C occupé après travail SQL | 74,78 Mio | 74,78 Mio |
| Démarrage SQL à la demande, dans ce passage | 4 066 ms | 955 ms |
| Requête SQL médiane / p95, 100 mesures | 2,92 / 10,10 ms | 1,90 / 2,74 ms |
| Workers auxiliaires avant SQL / après SQL | 0 / 16 | 0 / 16 |

Le temps de démarrage SQL comprend ici la création/initialisation des Workers différés et MariaDB ; il exclut le chargement initial du module principal dans la phase de création du runtime. Les 100 requêtes sont des petits COUNT, pas des pages PHP complètes. Une série ne définit ni un débit maximal ni une supériorité générale d'un navigateur. Les écarts avec les anciennes séries ne permettent pas d'isoler la cause d'un gain ou d'une régression.

CPU, énergie/batterie, pics continus de compilation et taille de transfert HTTP avec compression ne sont pas instrumentés par ces profils. Le ZIP téléchargeable (~9,3 Mio) n'est pas la taille réellement transférée par un hébergement servant le WASM brut (~31,76 Mio).

Les observations faites immédiatement après arrêt/destruction ne montrent pas de baisse immédiate de PSS dans ce passage. Terminer un Worker est asynchrone et aucun délai de stabilisation/GC n'est imposé. Ne pas présenter la fermeture comme une restitution garantie de centaines de Mio au navigateur.

## Comparaisons historiques

Toutes les valeurs ci-dessous sont prises au stade travail SQL. Une case d'allocateur non instrumenté reste inconnue ; elle ne vaut pas zéro.

| Révision/profil | Capacité WASM Chromium / Firefox | PSS Chromium / Firefox | Usage conseillé |
|---|---:|---:|---|
| Initial `original` | 737,75 / 732,94 Mio | 1 041,69 / 1 224,39 Mio | Référence historique ; trop coûteux pour le prototype |
| Piles 2 Mio seulement `pthread-2m` | 626,38 / 626,38 Mio | 975,14 / 1 368,08 Mio | Essai intermédiaire insuffisant ; baisse de capacité sans baisse physique systématique |
| Serveur réduit `bounded-server` | 256 / 256 Mio | 574,23 / 736,63 Mio | Ancien témoin de réduction des caches ; ne contient pas toutes les consolidations actuelles |
| Tables système `system-tables` | 256 / 256 Mio | 654,19 / 741,63 Mio | Jalon fonctionnel historique |
| Nettoyage/quotas `statement-cleanup` | 256 / 256 Mio | 654,82 / 743,06 Mio | Jalon récent avant chargement différé des Workers |
| Actuel `lazy-sql-workers` | 256 / 256 Mio | 542,41 / 758,26 Mio | **Profil à conserver par défaut** |

Avant le chargement différé, `statement-cleanup` observait PHP seul à 548,62 Mio Chromium / 817,22 Mio Firefox, avec des Workers auxiliaires déjà préchargés. Le passage actuel observe 278,93 / 617,85 Mio et aucun Worker auxiliaire SQL. Le nombre de Workers supprimés au démarrage est établi ; les différences exactes de RAM restent des observations entre passages.

## Réglages actuels

- Mémoire WASM initiale 256 Mio ; plafond de croissance 512 Mio.
- Pile principale 16 Mio, pile par pthread 2 Mio, pile Asyncify 128 Kio.
- InnoDB : pool et maximum 16 Mio, redo 8 Mio, log buffer 2 Mio.
- Aria/MyISAM : 1 Mio chacun ; query cache désactivé.
- Tables temporaires en mémoire : 4 Mio ; buffers de tri/jointure 256 Kio ; lecture 128/256 Kio.
- Paquet SQL serveur : 16 Mio ; commandes SQL appelantes : 8 Mio.
- 32 connexions appelantes ; registre partagé de 128 handles préparés natifs, 16 Mio de texte SQL réservé.
- Collecte d'un résultat : budget de blocs 16 Mio et 10 000 lignes ; la grille demande 100 lignes par page.
- `memory_limit` PHP 256M : ce n'est pas une limite couvrant MariaDB, VFS et navigateur.

Les quotas VFS, les copies réseau et le journal ont aussi leurs limites ; voir [RESOURCE-LIMITS.md](../packages/runtime/RESOURCE-LIMITS.md).

## Recommandation

**Conserver le profil réduit actuel, le SQL à la demande et les 16 Workers autorisés après activation. Privilégier Chromium pour les premiers essais sur machine limitée en mémoire**, car c'est le navigateur le moins consommateur dans les observations disponibles. Firefox fonctionne et reste une cible à maintenir, mais son coût global est sensiblement plus élevé ici.

Pour les projets sans base : éviter l'ouverture de la console et du schéma, puisque leur interrogation initialise SQL. Pour l'édition occasionnelle : décharger les outils inutilisés, en sachant que leur économie réelle doit encore être mesurée. L'arrêt SQL à chaud ne doit pas devenir un bouton d'optimisation mémoire : le chemin retenu est sauvegarde et nouveau moteur.

Ne pas réduire arbitrairement le pool à 8 : 15 Workers ont été nécessaires dans les scénarios observés. Réduire d'abord expérimentalement les threads internes InnoDB, puis ajuster le pool selon le nouveau pic et vérifier SQL, transactions, stockage et récupération.

La cible **moins de 300 Mio de RAM globale** n'est pas atteinte avec SQL actif. Un seul échantillon PHP seul Chromium est sous cette cible ; il ne prouve pas un budget garanti.

## Profils à ajouter, pas encore disponibles

| Profil envisagé | Travail nécessaire | Consommation connue |
|---|---|---|
| Web statique sans moteur PHP | Fichiers/routage/persistance sans instancier le WASM commun | Non mesurée |
| Initialisation WASM 64/128 Mio | Rebuild, stress de croissance mémoire et vues partagées, buffers, threads, imports | Non mesurée ; ce sont des pistes, pas des budgets acquis |
| SQL compact | Threads I/O/purge réduits, essais de caches et de pool, comparaison sur projets réels | Non mesurée |
| SQL capacité accrue | Caches 32/64 Mio et contraintes cohérentes avec VFS/résultats | Non mesurée sur la version actuelle ; réserver aux besoins démontrés |
| Édition complète | CodeMirror et services de langage réellement intégrés et déchargeables | Non mesurée ; aucun coût LSP fiable à annoncer |

## Preuves

Les nouveaux JSON sont sous `benchmarks/receipts/native-memory/lazy-sql-workers/`. Commande exécutée :

```bash
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node benchmarks/native/memory.mjs lazy-sql-workers
```

Les protocoles/limites et anciennes séries sont conservés dans [benchmarks/native/README.md](../benchmarks/native/README.md). Le test de charge historique à deux clients offre 5 puis 10 requêtes/s par client pendant 10 s par palier. Les 100 puis 200 réponses sont vérifiées ; au palier 10, médiane/p95 HTTP : 14,45/22,85 ms Chromium, 15,44/20,62 ms Firefox. Ce résultat ne démontre pas un plafond de débit, une endurance longue ni le coût de N fenêtres arbitraires.


## Mémoire et protocole de mesure

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

