# Résultats CI amont — 31 octobre 2026 (jalon 3, preuve partielle)

Source : [Native upstream baseline, run 41197139983](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41197139983), SHA déclencheur `61ec426a0d1568b69b39e456049d25f9a6fa48b3`, Ubuntu 24.04, Node 24, Emscripten 6.0.6. Journaux bruts associés aux jobs/artifacts GitHub Actions (rétention des artifacts initialement 14 jours).

| Job / ID GitHub | Exécution réelle et résultats | Statut |
|---|---|---|
| MariaDB original / `124525488592` | `wasm/build.sh` sur `shyim/lite4mariadb@24be937...` ; échec à ~45 % sur `mysys/get_password.c:153,162` : `iscntrl`, `isspace` non déclarés (header `<ctype.h>`) | ÉCHEC. Aucun test original post-build réalisé |
| MariaDB bridge / `124525488810` | `node scripts/build-engine.mjs` ; `npm run build:upstream -- 8.4` ; `npm run test:upstream` **5/5** ; `npm run test:integration` **42/42** ; `npm run test:browser` **14/14** (Chromium et Firefox) | SUCCÈS |
| PHP JoomEngine / `124525488841` | `bash build/build.sh 8.4` ; `npm run test:integration` **36/36** ; `npm run test:database` **1/1** ; `npm run test:browser` **14/14** ; `npm run test:database:browser` **2/2** (Chromium et Firefox) | SUCCÈS |

Les exécutions couvrent SQL et PDO réels, transactions, connexions séparées, persistance IndexedDB après reload, et erreurs de fin de requête. Un message `Fatal error` intentionnel dans la suite PHP du bridge et une erreur InnoDB d'un datadir volontairement corrompu ne sont **pas** les causes du statut global rouge : ces scénarios sont validés comme attendus par les assertions.

Le run de mesure [41198951757](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41198951757) est **skipped** : `workflow_run.conclusion == 'success'` était une condition trop large car un autre job a échoué. **Aucun chiffre de consommation RAM ni de débit propre à WASMWebServer n'a été produit à cette date**.

Artefacts (initialement disponibles dans le run) :
- `baseline-mariadb-original`, ID `13041901458`, 43 089 octets (logs de l'échec) ;
- `baseline-mariadb-bridge`, ID `13041492534`, 5 693 714 octets ;
- `baseline-php-8.4`, ID `13041532952`, 21 572 873 octets.

## Reproduction

Les commandes et les paramètres précis sont dans `.github/workflows/native-baseline.yml` ; les hashes amont sont dans `provenance/upstream-lock.json`. Le compilateur a proposé `#include <ctype.h>` pour `get_password.c` : le témoin sans correctif reste enregistré ici ; une éventuelle correction doit être tracée comme patch de compatibilité appliqué **sur une copie de compilation uniquement**.

## Conditions pour clore le jalon 3

- Compilation et tests de MariaDB originale achevés, ou incompatibilité versionnelle démontrée avec un témoin reproductible et un correctif compiler-only validé.
- Résultats PHP/PDO/MariaDB du bridge et JoomEngine conservés séparément, sans mélanger leurs versions.
- Benchmark navigateur du même build : démarrage, latence (échantillons bruts, p50/p95), mémoire disponible avec ses limites, accès PHP, SQL seul, PHP/PDO SQL, connexions et persistance.
- Mesures archivées et interprétées ; aucune optimisation et aucune fusion avant acceptation.

## Nouvelle tentative : run 41202949547, 31 octobre 2026

Le job `MariaDB original-compat` (`124542227020`) a échoué à `git apply --check` **avant la compilation**, avec `patch failed: mysys/get_password.c:24`. Le patch avait déclaré un hunk `@@ -24,3 +24,4 @@` alors que `#include "mysql.h"` est ligne **23** de la révision `24be937...`. L'échec ne prouve rien sur le lien MariaDB ni sur le runtime navigateur.

Le correctif suivant fixe le hunk `@@ -23,5 +23,6 @@` avec les lignes vides et `#ifdef HAVE_GETPASS` en contexte. Un essai de `git apply --check` et `git apply` sur le contexte reproduit du fichier amont a réussi hors CI ; le test réel du checkout GitHub reste la preuve à obtenir. La validation du patch passe désormais **avant** le téléchargement des deux sous-modules massifs. Le workflow natif annule les instances plus anciennes par `concurrency.cancel-in-progress: true` ; ses artefacts PHP, MariaDB et benchmarks conservent 90 jours dans GitHub Actions, pas une archive permanente.

Les jobs bridge et PHP du run 41202949547 étaient encore en cours au moment de cette consignation. **Leur réussite, leur arrêt éventuel et les futures mesures ne sont pas présumés**.
