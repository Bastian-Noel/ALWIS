# Accélération CI : artefacts et caches (31 octobre 2026)

## Réutiliser des builds existants (priorité absolue)

Le workflow `baseline-measurements.yml` récupère un artefact PHP compilé, par exemple le run natif **41204266390** (3 jobs verts, 30 min 45 s). Les changements du benchmark ne relancent **pas** la compilation native. Le déclenchement `push` lit le plus récent `Native upstream baseline` **réussi** sur `main` ; `workflow_dispatch` accepte un `run_id` explicite. Les mesures restent attribuées au SHA du harness et à l'identifiant du build.

## Caches des reconstructions complètes

Les trois jobs natifs utilisent `actions/cache@v4` avec chemins isolés : `EM_CACHE` pour les bibliothèques Emscripten, `CCACHE_DIR` pour les objets compilés par Clang, et `EM_COMPILER_WRAPPER=ccache` conformément au mécanisme officiel d'Emscripten. `actions/setup-node` met en cache les téléchargements npm selon le `package-lock.json` de chaque amont. Le répertoire `node_modules` n'est pas réutilisé et `npm ci` reste exécuté.

Les clés intègrent `ubuntu`, la famille MariaDB (`original-compat` / `bridge`) ou PHP 8.4, Emscripten 6.0.6 et les empreintes des versions verrouillées / du patch de compatibilité. Cela évite de confondre deux ABI ou deux historiques différents. `CCACHE_COMPILERCHECK=content` vérifie le compilateur ; les caches manquants déclenchent des builds normaux. La limitation à **600 Mio d'objets ccache par job** borne l'espace hors caches de bibliothèques d'Emscripten.

**Attention :** le premier build sous cette configuration amorce les caches ; l'exactitude et le nombre de hits se vérifient sur le *deuxième* build natif, dans les étapes `Report ... compiler cache usage`. Un cache peut expirer, être évincé ou ne pas être réutilisable ; le workflow ne présume jamais qu'un cache vaut une preuve de compilation ni que le temps est diminué. Le cache Emscripten ne remplace ni le SDK 6.0.6 installé sur le runner ni l'exécution des tests.

La rétention des artefacts natifs et des rapports de mesure est configurée sur **90 jours**, indépendamment du cycle de vie des caches. Un run manuel du workflow natif est nécessaire pour mesurer le gain de cache sans changer le code source.

## Commandes de vérification

- GitHub Actions `Native upstream baseline` : inspecter `Restore versioned ... compiler caches` et `Report ... cache usage`.
- GitHub Actions `Measure compiled upstream baseline` : inspecter `Reuse latest successful native build without recompiling`, `build-run.txt`, `harness-commit.txt`, `chromium.json` et `firefox.json`.
- Comparer durée et hit-rate seulement à caractéristiques matérielles, versions et scénarios identiques. Les builds simultanés des trois jobs ne s'additionnent pas pour le temps de CI total.
