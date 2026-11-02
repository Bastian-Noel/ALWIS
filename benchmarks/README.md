# Mesures reproductibles

Pour chaque essai conserver commit, SHA-256 des assets, options de compilation, navigateur/version, OS, CPU, mémoire disponible, profil et commandes. Les runners CI servent à vérifier la reproduction ; leurs chiffres ne remplacent pas une mesure interactive sur le matériel cible.

Mesurer séparément démarrage froid/chaud, PHP seul, SQL seul, PHP avec 1/10/100 appels SQL, persistance et restauration. Conserver les échantillons bruts et calculer p50/p95 plutôt que seulement une moyenne. Distinguer durée moteur et durée HTTP complète.

Mémoire : taille initiale/maximum/atteinte de la mémoire WASM, allocations vivantes si instrumentables, mémoire JS et mesure globale du navigateur si disponible. Une mesure indisponible reste explicitement indisponible ; `memory.buffer.byteLength` n'est pas la RAM physique.

Fenêtres : 1, 2, 4 puis 8 fenêtres comme points de mesure, sans limite structurelle à 8 ; sessions toutes distinctes puis partagées. Mesurer la surcharge marginale et l'admission sous saturation.

Expériences SQL : jamais démarré, actif, arrêté, redémarré, puis cycles répétés. Vérifier données et transactions après chaque transition. Conserver l'arrêt à chaud seulement si gain mesuré et stabilité justifient sa complexité.

Outils : actif, en veille, déchargé puis restauré. Mesurer mémoire récupérée, temps de reprise, intégrité des modifications et historique borné.

## Déclenchement et preuve

Le [workflow de mesures](../.github/workflow-templates/baseline-measurements.yml) est une recette historique inactive, à copier explicitement dans workflows/ avant utilisation. Il était lancé après chaque exécution native terminée avec statut `success` **ou `failure`** ; l'échec d'un job MariaDB original ne masque donc plus un artifact PHP réussi. Un lancement manuel peut fournir un `run_id` natif. Le workflow exige explicitement l'artifact `baseline-php-8.4` : absent, il échoue (il ne déclare pas de mesures imaginaires).

Le harness `baseline-browser.mjs` s'exécute contre la compilation JoomEngine et son **bridge épinglé 0.1.1**, pas contre la variante bridge 0.1.8. Chaque fichier `chromium.json` / `firefox.json` contient versions, empreintes, mesures individuelles, validation des réponses et persistance ou erreur explicite. Les artefacts CI ont une rétention de 90 jours : un résultat durable doit ensuite être intégré au dépôt avec son contexte, sans modifier les données brutes.

La mémoire d'agent navigateur est mesurée seulement si l'API `measureUserAgentSpecificMemory` est disponible ; le résultat est autrement marqué non disponible. Ce chiffre n'est ni la taille des pages linéaires WASM, ni la mémoire physique du navigateur. Sans mesure fiable et comparable, le jalon 3 demeure **ouvert**.

## Correction du benchmark et relance sans recompilation (31 octobre 2026)

Le premier essai de mesures, run [41206588689](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41206588689), a généré **zéro échantillon** sur Chromium et Firefox : `PDOException SQLSTATE[08004]: The embedded MariaDB connection is already leased`. Le banc conservait le bail console SQL lors des premières requêtes PDO. Le bridge JoomEngine **v0.1.1** de ce témoin impose un bail à la fois ; ce n'est pas une preuve que la variante v0.1.8 ou le futur pont natif possèdent cette limite. Le scénario sépare désormais la phase SQL seule, libère son bail, puis mesure PDO et écrit la fixture de persistance en PDO ; la relecture après fermeture/restauration reste obligatoire.

Sur chaque changement du harness ou de son workflow sur `main`, le workflow de mesure sélectionne la **dernière exécution native réussie** via l'API GitHub et télécharge son artefact `baseline-php-8.4` : aucune recompilation du moteur. La commande manuelle `workflow_dispatch(run_id)` permet de sélectionner une exécution précise ; l'événement `workflow_run` conserve l'identifiant de sa propre compilation. Les résultats JSON incluent le commit du harness et la référence au run source. Le run [41204266390](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41204266390) a validé les trois compilations natives, y compris le correctif original MariaDB, en **30 min 45 s** ; ses artefacts demeurent disponibles pour les mesures.

## Processus du navigateur et mémoire réelle sous Linux

Le script collecte désormais (en complément de l'API navigateur facultative) des instantanés de la **PSS** Linux des descendants du processus Node Playwright, via `/proc/<pid>/smaps_rollup`. Les snapshots sont réalisés à chaque étape `memoryBefore`, `memoryPhpOnly`, `memorySqlOnly`, `memoryPhpWithSqlStarted`, `memoryCombined` et `memoryAfterClose` ; les champs sont `linuxProcessTree.pssBytes`, `rssSumBytes`, `processCount` et `available`. Si `smaps_rollup` n'est pas accessible, la PSS est **non disponible** ; le champ RSS est une somme susceptible de compter plusieurs fois les pages partagées.

Une PSS est plus représentative que la somme des RSS, mais **reste la mémoire des processus navigateurs + workers, pas la seule mémoire WASM**. Les comparaisons doivent conserver le même navigateur, la même machine, l'ordre des tests et les échantillons bruts. Le workflow met également en cache npm et les navigateurs Playwright épinglés, sans cacher les modules PHP/MariaDB à la place de leurs artefacts.

## Isolation des nouveaux échantillons (révision locale du 31 octobre 2026)

Le défaut est maintenant `BASELINE_ISOLATION=cold` : chaque échantillon relance un navigateur, puis le ferme même si la mesure ou la sauvegarde échoue. `BASELINE_ISOLATION=warm` conserve le processus pour les trois échantillons, avec un contexte neuf par échantillon. Le lancement manuel du workflow expose ce choix dans `isolation`. Les caches OS/disque ne sont pas purgés : « cold » désigne ici le processus navigateur, pas toute la machine. Les warmups de requêtes restent identiques.

Depuis un checkout JoomEngine PHP épinglé et préparé avec ses binaires, dépendances et navigateurs :

```sh
BASELINE_ISOLATION=cold BENCHMARK_OUTPUT=/chemin/resultats-cold node /chemin/WASMWebServer/benchmarks/baseline-browser.mjs
BASELINE_ISOLATION=warm BENCHMARK_OUTPUT=/chemin/resultats-warm node /chemin/WASMWebServer/benchmarks/baseline-browser.mjs
```

Utiliser des répertoires de résultats distincts. Le schéma JSON v2 indique le mode d'isolation et les capacités non vérifiées (mémoire linéaire, crash recovery, console/PDO simultanés). Les empreintes du banc principal seules ne couvrent pas ses helpers ; conserver également le commit du harness fourni par la CI.

**Validation :** les tests du helper valident uniquement orchestration/fermeture/propagation des erreurs ; le nouveau banc PHP/MariaDB n'a pas été exécuté ici, faute d'accès aux artefacts et au SDK. Voir [le receipt de reprise](REPRISE-2026-10-31.md).

## Diagnostic linéaire et interruption

`python3 scripts/prepare-baseline-diagnostics.py build-work/php build-work/php-diagnostics` crée une copie diagnostique neuve du checkout épinglé déjà préparé. Six adaptations des wrappers exposent des instantanés de capacité linéaire ; leurs empreintes avant/après sont dans `diagnostic-adapter.json`. Les deux fichiers WASM restent identiques octet pour octet. Depuis cette copie, lancer le banc avec `BASELINE_DIAGNOSTICS=1` pour obtenir `memory*.linearWasmMemory.php/sql.linearMemoryBytes`. Ces tailles ne sont ni les allocations vivantes ni la RAM résidente ; le maximum configuré du binaire se lit séparément avec l'inspecteur ABI. Les instantanés ne constituent pas une instrumentation continue des pics.

`benchmarks/crash-recovery-browser.mjs`, lancé depuis le checkout PHP préparé, vérifie une ligne InnoDB explicitement flushée puis détruit la page sans `db.close`, avec une transaction non validée. La réouverture doit retrouver uniquement la ligne validée. Cela démontre la restauration de la sauvegarde acquittée après interruption, pas la durabilité des commits non flushés ni un arrêt pendant `syncfs`.

Les [rapports conservés](receipts/2026-10-31/local/SUMMARY.json) distinguent les variantes réellement exécutées. Les tests amont de transactions/rollback ont aussi été relancés dans Node et les deux navigateurs. Ne pas confondre ces témoins avec le prototype fusionné.
