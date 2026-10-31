# Témoins natifs amont

## Matrice de reproduction

| Composant | Source exacte | Recette / rôle |
|---|---|---|
| lite4mariadb | `24be9371a2f6c71250a2356631ad6feab2280b02` | `wasm/build.sh`, build hôte import_executables puis cible WASM |
| Bridge JoomEngine | `56d47b4dc867af313592efa09e12df470a36e129` | `scripts/build-engine.mjs`, patch amont sessions indépendantes |
| Sean Morris PHP | `1e1fb6703730759181e84c62bce35ee9129febb9` | Runtime 0.2.0, PHP 8.4.1 pour le témoin bridge |
| SDK | `d7b4130688bfa348392b921ab04015aa15c4f154` | Emscripten 6.0.6 |
| JoomEngine PHP | `3b8cef42c020fbcbb6b41fad86716b7c8664b55b` | `build/build.sh 8.4`, PHP 8.4.27 et dépendances de `versions.json` |

Les deux chaînes PHP sont distinctes. Le bridge compile un **module PDO**, pas le moteur PHP : ses tests emploient le runtime npm épinglé. Le job JoomEngine compile PHP lui-même et exécute ses suites Node et navigateur. Ne jamais présenter ces deux preuves comme une compilation fusionnée, ni brancher arbitrairement l'extension PHP 8.4.1 sur PHP 8.4.27.

## Points de code et implications

- `lite4mariadb/wasm/build.sh` : construit d'abord les outils hôtes, puis le serveur embarqué WASM. Les sous-modules `libmariadb` et wolfSSL sont nécessaires.
- Bridge `scripts/build-engine.mjs` : exige le commit exact ; applique et vérifie le diff amont ; produit JS/WASM et hashes. Le témoin conserve le pool navigateur de 16 pthreads et budget CPU de 4 définis par l'amont.
- Bridge `scripts/prepare-engine.mjs` : refuse un binaire sans provenance correspondante. Copier uniquement un WASM npm ne suffit pas.
- Bridge `native/build-upstream.sh` : configure les headers PHP verrouillés puis compile `pdo_mariadb_wasm.c` en SIDE_MODULE avec Asyncify.
- Bridge `native/tests/upstream.test.mjs` : contrat PDO, erreurs et nettoyage des requêtes CGI ; runtime PHP publié, exécution Node.
- Bridge `test/browser.test.mjs` : MariaDB réelle dans un Dedicated Worker, types SQL, sauvegarde, hard reload, verrou d'écriture et arrêts répétés. Ce test seul ne couvre pas PHP navigateur.
- JoomEngine `build/build.sh`, `versions.json` : chaîne complète PHP et extensions avec versions et empreintes propres.
- JoomEngine `test/browser.test.mjs` et `test/database-browser.test.mjs` : PHP navigateur puis PDO/MariaDB ; bridge de sa matrice, à enregistrer dans les résultats.
- Sean Morris `Makefile` et `.github/workflows/build-step.yaml` : profils PHP et wrappers Node/Web/CGI construits dans son image Docker Emscripten patchée. Son patch SDK appartient à cette chaîne, pas automatiquement au build MariaDB.

Les repères détaillés historiques restent dans `docs/CODE-MAP.md`. Prochaine analyse pour la fusion : contraintes pthread/Asyncify, symboles d'initialisation et d'arrêt, allocateurs, API SQL embarquée et propriétaires des résultats. Aucun patch de fusion avant la preuve du témoin.

## Correction de compatibilité isolée (suite du run 41197139983)

La chaîne **originale sans patch** reste représentée par le job d'échec du 31 octobre 2026, documenté dans `CI-RECEIPT.md`. Le nouveau job `original-compat` restaure le commit strict `24be9371a2f6c71250a2356631ad6feab2280b02`, puis applique **seulement** `compat/0001-get-password-ctype.patch` à la copie jetable de build. Ce patch ajoute `<ctype.h>` dans `mysys/get_password.c` pour satisfaire le compilateur C99+ utilisé par Emscripten 6.0.6. Aucun patch fonctionnel (SQL, mémoire, threading, ABI) n'est appliqué à cette variante.

Le CI exécute `git apply --check`, `git diff --check`, enregistre le SHA-256 du patch et le diff effectif, puis lance `wasm/build.sh` et `npm test`. Un succès de compilation **ne sera pas** compté comme un test navigateur MariaDB original : les tests navigateur MariaDB du bridge sont distincts. En cas d'un nouvel échec, garder les logs et corriger seulement la nouvelle cause démontrée.
