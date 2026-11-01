# Profils de performance et choix conseillé — 1 novembre 2026

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
