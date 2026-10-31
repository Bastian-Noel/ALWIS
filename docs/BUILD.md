# Préparer le premier build reproductible

## État de l'environnement de reconstruction

`provenance/environment.json` a été créé par `scripts/doctor.py`. Node, Python, Git, curl, make et un compilateur C sont présents. Emscripten/emcmake, CMake, Ninja, bison, re2c, autoconf et pkg-config ne sont pas trouvés ici. Aucun moteur ni extension n'a été compilé. Le header de contrat peut être vérifié syntaxiquement avec le compilateur C disponible ; ce n'est pas un test du backend.

## Verrou d'étude et verrou de build

| Entrée | Usage |
|---|---|
| `upstream-lock.json` | Commits des 17 références étudiées, archive SHA-256 et emplacement local |
| `submodules-lock.json` | Gitlinks MariaDB, deux archives utiles téléchargées, modules optionnels inventoriés |
| Bridge `native/upstream-versions.json` | Compatibilité de la première expérience Sean Morris/PDO/PHP/SDK |
| Bridge `scripts/prepare-engine.mjs` | Moteur lite4mariadb 0.1.2 au commit explicitement vérifié |
| JoomEngine PHP `versions.json` | Alternative avec autres versions PHP et autre commit de bridge |

Le commit Sean Morris attendu par le bridge correspond au snapshot de référence téléchargé. Le commit lite4mariadb attendu correspond aussi au snapshot. Le `php/php-src` HEAD est une référence de lecture ; pour l'extension charger les sources officielles de la version PHP exacte donnée par le bridge et vérifier son SHA-256. Même distinction pour Emscripten HEAD : l'expérience de départ réclame **6.0.6**, pas HEAD.

## Dépendances natives

Le build amont de MariaDB utilise des outils natifs pour produire `import_executables.cmake`, puis un build croisé WASM. Il ne suffit pas d'exécuter emcc sur `lite4mariadb.c`. Prévoir compilateur C/C++, make, CMake/Ninja, pkg-config, dépendances système SSL/zlib/PCRE/fmt selon recette, et le SDK Emscripten épinglé. PHP requiert aussi la chaîne configure/autoconf, bison/re2c selon source et extensions. Les paquets précis dépendent du poste ; ne pas installer ceux d'une autre distribution à l'aveugle.

Les sous-modules `libmariadb` et `extra/wolfssl/wolfssl` sont récupérés au gitlink exact, comme le script `build-engine.mjs` du bridge. Les modules rocksdb, columnstore, duckdb, wsrep-lib et libmarias3 sont inventoriés, pas téléchargés pour ce profil réduit. Réexaminer les options CMake finales avant d'affirmer qu'un build n'en a pas besoin.

## Sources préservées et copies de build

Les dossiers `upstream/` sont des snapshots sans historique Git, pas des clones récursifs. Ne pas patcher les archives originales. Travailler dans `build-work/` et garder dans le manifeste final les commits, empreintes et patchs appliqués.

Attention : le script moteur du bridge vérifie `git rev-parse HEAD` et appelle `git submodule update`. Il attend un vrai checkout Git. Pour le lancer sans le modifier, il faut préparer ce checkout au commit verrouillé (ou le laisser cloner son dépôt), même si la copie d'étude est déjà disponible. Le paquet livré est une sauvegarde des sources et de la préparation, **pas un SDK ni un build complètement hors ligne**. Les téléchargements PHP, SDK et paquets npm restent nécessaires.

## Procédure témoin à suivre sur le poste de build

Après installation des prérequis et activation d'Emscripten 6.0.6, créer une copie de travail du bridge épinglé et vérifier son `package-lock.json`. Le bridge demande Node 24+.

```bash
cd build-work/mariadb-wasm-bridge
npm ci
npm run build:engine
npm run build:upstream -- 8.4
npm run test:upstream
```

Ces commandes reprennent les scripts réellement présents dans le dépôt. `build:engine` récupère/verrouille MariaDB, ses deux sous-modules, applique le patch de sessions et construit les assets. `build:upstream -- 8.4` configure les headers PHP 8.4.1 attendus par la matrice consultée et compile le module PDO chargeable. `test:upstream` prépare les assets et lance les tests d'exécution ; les prérequis navigateur dépendent de la suite amont. Lire son README et les tests avant lancement, puis conserver leurs logs. Ces commandes **n'ont pas été exécutées ici**.

Après ce témoin, intégrer le profil d'extensions scolaires. Pour le premier PDO témoin, utiliser les versions de son manifeste ; ne pas remplacer silencieusement une version par une autre sous prétexte que le minor PHP correspond.

## Profil PHP cible

Socle : PDO adapté, MySQLi natif adapté, sessions, JSON, filter, ctype, tokenizer, fileinfo, mbstring/iconv, DOM/XML/SimpleXML, ZIP/zlib/Phar, OpenSSL et GD. `intl` peut rester optionnel pour éviter le chargement ICU pour chaque exercice. OPcache et son interaction avec invalidation sont à mesurer. Le réseau HTTP sortant nécessite une intégration navigateur spécifique même si cURL/OpenSSL compilent.

## Conditions navigateur et serveur

Le test navigateur nécessite un contexte sécurisé, les mécanismes Workers/SW requis, et l'isolation interorigines pour SharedArrayBuffer/pthreads. Vérifier `crossOriginIsolated` et la compatibilité de tous les assets avec COOP/COEP. Une configuration courante emploie `Cross-Origin-Opener-Policy: same-origin` et `Cross-Origin-Embedder-Policy: require-corp`, avec ressources compatibles.

Un simple `python3 -m http.server` ne pose pas ces en-têtes par défaut. Préparer le serveur de test approprié avant de conclure à un bug moteur. Contrôler MIME `application/wasm`, scopes SW, chemins d'assets et leur version commune.

## Preuve à archiver après build

Conserver commande/version SDK, versions PHP et libs, options configure/CMake, sha des sources/patchs, manifests JS/WASM, tests amont, tests projet et bruts de benchmark. L'optimisation mémoire vient après le témoin : le patch de sessions modifie aussi des réglages et corrige des attentes InnoDB ; ne pas supprimer ces corrections en ramenant le buffer pool à 16 Mio.
