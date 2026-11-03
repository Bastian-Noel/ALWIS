# Distribution, CI et publication


## Paquet statique de test du studio

Publication FTP via GitHub Actions : [guide actuel](deployment.md).

Le site se prépare sans serveur PHP distant : PHP et MariaDB sont compilés dans le moteur WASM et exécutés dans le navigateur. Les projets restent dans le stockage de ce navigateur après sauvegarde.

```bash
node scripts/package-workbench/main.mjs
node scripts/serve-site-package.mjs
## http://127.0.0.1:8090
```

Le dossier `build-work/site/` contient uniquement les ressources web : interface, runtime navigateur, moteur compilé, routeur Service Worker, en-têtes et lanceur local. Il exclut reçus internes, documents de travail et Git. `release.json` conserve révision, tailles et empreintes des ressources copiées. Le fichier WASM fait environ 32 Mio ; l'hébergeur doit accepter cette taille par fichier.

Pour un ZIP extrait sur un autre PC : `node serve.mjs`, puis ouvrir `http://127.0.0.1:8080`. `PBL_SITE_PORT=8081 node serve.mjs` change le port si nécessaire. Le lanceur nécessite Node.js 20 ou plus récent et diffuse uniquement ce dossier.

## Exigences d'hébergement

- HTTPS, ou localhost pour un essai local.
- `Cross-Origin-Opener-Policy: same-origin` et `Cross-Origin-Embedder-Policy: require-corp`.
- WASM servi en `application/wasm` et modules JavaScript servis avec leur type correct.
- Service Worker autorisé à la racine, sans réécriture globale des fichiers manquants vers index.html.

`_headers` fournit la configuration des hébergeurs compatibles avec ce format. Un hébergeur qui l'ignore doit configurer les mêmes valeurs autrement. Sans isolation d'origine, l'interface signale désormais la configuration d'hébergement nécessaire avant de créer le moteur ; le fait de n'utiliser que PHP ne dispense pas de cette condition car le module commun utilise une mémoire partagée.

## Validation et état de publication

```bash
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/site-package.mjs
```

Le test charge le paquet statique exact dans Chromium et Firefox : isolation, PHP sans Worker SQL, première connexion PDO et MySQLi, POST exécuté une seule fois, deuxième requête, puis ouverture du studio, exemple, fenêtre cliente et sauvegarde/fermeture. Les résultats sont archivés dans `apps/studio/receipts/deployment/`.

La préparation ne prouve pas une mise en ligne. À ce jalon, aucun déploiement public n'est confirmé : les outils Sites n'étaient pas exposés dans la session de travail. Le paquet est prêt pour la connexion de l'hébergement demandé. Un aperçu public chez un autre fournisseur doit suivre l'accord explicite demandé dans la conversation.

État actualisé pendant le bilan : l'utilisateur a autorisé l'aperçu gratuit Cloudflare. L'exécutable officiel vérifié ne peut pas provisionner le tunnel depuis cet environnement ; la requête API via le proxy renvoie HTTP 403, « Your request was blocked ». Aucun lien ni déploiement Cloudflare n'a été créé. Cette autorisation n'est donc plus le blocage ; l'accès au service l'est.

Les Workers pthreads SQL sont maintenant chargés au premier besoin SQL, et leur nombre reste borné à 16 dans ce profil. Les observations du paquet sont 0 Worker auxiliaire avant SQL, puis 16 créés ; le pic observé vaut 15 sur les deux navigateurs lors du dernier passage. Cela ne constitue pas encore une mesure du gain de RAM globale. Le démarrage conserve la même requête PHP : le compteur écrit avant PDO passe de 1 à 2 sur deux requêtes, sans rejeu automatique.


## Publication statique sur FTP avec GitHub Actions

Workflow : **Publish FTP - validated studio** (`.github/workflows/publish-ftp.yml`). Lancement manuel uniquement depuis Actions → workflow → Run workflow. Aucun push ne déclenche une publication FTP.

Le job installe les dépendances npm épinglées, construit les éditeurs, vérifie les tests Node, assemble le site statique et l'ouvre réellement dans Chromium et Firefox avant l'envoi FTP. Le module PHP/MariaDB provient du dernier build natif validé, épinglé par `config/native-runtime.json` dans une release technique. Son hash et les empreintes des sources C doivent correspondre ; une modification native oblige à recompiler/valider avant publication. Ce job court ne prétend pas recompiler MariaDB à chaque publication d'interface.

## Configuration

La relance du 1 novembre a réussi l’envoi FTP. Un seul secret obligatoire dans Settings → Secrets and variables → Actions : **FTP_PASSWORD**. Le mot de passe ne figure ni dans le dépôt, ni dans le workflow, ni dans les logs du script.

Hôte, port 21 et utilisateur sont préconfigurés dans le workflow selon les paramètres fournis. Variables facultatives du dépôt :

| Variable | Usage |
|---|---|
| `FTP_REMOTE_DIR` | Document root FTP, `.` par défaut ; si la racine contient public_html/www/httpdocs/htdocs, le script demande ce choix explicite |
| `FTP_PUBLIC_URL` | URL HTTPS publique, pour vérifier le certificat et les en-têtes COOP/COEP après l'envoi |

L'intégration GitHub utilisée pour préparer ce déploiement a reçu HTTP 403 sur l'API des secrets et sur la création d'environnement. Ce refus ne prouve pas un mauvais mot de passe FTP. Si ce droit reste absent, seul un administrateur via l'interface GitHub, ou une intégration disposant du droit adéquat, peut enregistrer FTP_PASSWORD. Le workflow décrit précisément ce manque s'il arrive sans secret.

## Envoi et vérifications

Envoi passif dans un dossier temporaire, contrôle des tailles, sauvegarde privée des fichiers remplacés comme artefact GitHub, puis renommage fichier par fichier, index.html en dernier. Aucun ancien fichier de projet n'est supprimé. Cette promotion est atomique par fichier ; elle ne garantit pas une bascule transactionnelle de tout le site. Les anciens fichiers sont disponibles sept jours dans l'artefact privé `ftp-previous-site-*`.

Le site statique validé est conservé quatorze jours dans l'artefact `studio-static-*`, même si FTP échoue. Une publication FTP réussie sans URL publique n'est pas présentée comme un test navigateur du site en ligne.

Un bloc Apache `.htaccess` géré est ajouté en conservant les règles existantes : MIME WASM, COOP same-origin, COEP require-corp et index.html. Nginx ignore `.htaccess` et doit fournir ces en-têtes dans sa configuration serveur. L'outil PHP d'export SQL est distribué comme **sql-export.source.txt** ; un hébergeur disposant de PHP ne doit jamais l'exécuter côté serveur.

Le FTP doit accepter les connexions passives et les renommages. Le protocole demandé est FTP sur le port 21 ; l'authentification n'est pas assimilée à du FTPS. Depuis l'environnement cloud de préparation, le port direct était refusé et le proxy expirait sans bannière ; le runner GitHub effectue donc son propre test réel.

## Versionner le paquet publié

Les champs manuels `operation`, `version` et `validated_run` permettent de publier une version nommée à partir du paquet exact dont le transfert FTP a réussi. `publish` réalise le build et l’envoi ; `release` reprend un envoi antérieur sans refaire le transfert. Voir les [règles et limites de création des tags](deployment.md).


## CI et versions

Deux workflows sont actifs :

| Workflow | Déclenchement | Rôle |
|---|---|---|
| CI - validated studio | Push main, pull request, manuel | Build et validations partagées ; les changements Markdown seuls sont ignorés |
| Publish FTP - validated studio | Manuel uniquement | Même validation, paquet statique, transfert FTP et version optionnelle |

Les contrôles sont définis une seule fois dans `.github/actions/validated-studio/action.yml`. Les actions externes sont épinglées par commit. Les anciennes recettes de témoins et d'archivage des sources sont conservées dans `.github/workflow-templates/`, sans exécution automatique. Elles ne sont pas des contrôles quotidiens du studio custom.

## Publier une version

Dans **Publish FTP - validated studio → Run workflow**, choisir `operation=publish`. Laisser `version` vide pour un simple déploiement ou utiliser un nom comme `v0.2.0-preview.1` pour créer une release après réussite du transfert.

Pour versionner un build déjà envoyé, choisir `operation=release`, renseigner `version` et l'identifiant de l'exécution FTP dans `validated_run`. Le script exige un job FTP réussi sur main, vérifie la révision et toutes les empreintes du manifeste, puis reprend le paquet exact sans le reconstruire. Les reçus CI disponibles pour cette révision accompagnent le ZIP, avec SHA256SUMS.

Une version publiée ne peut pas être remplacée par ce script ; choisir un nouveau numéro. Le script peut reprendre un brouillon correspondant à la même source. Les versions stables deviennent la dernière release ; les suffixes alpha/beta/rc/preview restent des préversions. Une version stable nommée reste soumise aux limites fonctionnelles documentées du prototype.

La création initiale de release avec le jeton du runner a reçu HTTP 403 dans ce dépôt, malgré `contents: write`. Préparer le tag seul n'a pas suffi. Pour v0.1.0, le brouillon a été créé avec l'intégration GitHub autorisée, sur **la révision validée**, puis le workflow a réussi l'ajout des trois pièces jointes et la publication. Si ce refus revient, un mainteneur prépare le brouillon avec le même tag et la même révision, puis relance `operation=release`. Ne pas déplacer un tag publié vers une autre source.

## Conservation

Les paquets Actions expirent après 14 jours et les sauvegardes FTP après 7 jours. Les pièces jointes d'une release constituent la distribution durable. Les caches accélèrent les jobs sans constituer une preuve de validation. Les six anciens caches amont supprimés représentaient 405 373 660 octets.

L'archive `sources-2026-10-31` est une archive de provenance séparée, identifiée comme telle et exclue de la dernière release applicative. La supprimer casserait la restauration des sources. Les reçus historiques et les licences sont conservés ; l'historique Git n'est pas réécrit.

Première version publiée : [v0.1.0](https://github.com/Bastian-Noel/ALWIS/releases/tag/v0.1.0), [exécution de versionnement réussie](https://github.com/Bastian-Noel/ALWIS/actions/runs/41334230705).

Préversion actuelle de la refonte IDE : [v0.2.0-preview.2](https://github.com/Bastian-Noel/ALWIS/releases/tag/v0.2.0-preview.2), source `19b6ee0`, [CI réussie](https://github.com/Bastian-Noel/ALWIS/actions/runs/41337154626), [FTP et release réussis](https://github.com/Bastian-Noel/ALWIS/actions/runs/41337170552). La préversion intermédiaire de ce lot et son tag ont été retirés après validation de la version corrigée.


## Accélération CI : artefacts et caches (31 octobre 2026)

> Document historique des témoins amont. Les recettes décrites sont désormais archivées dans `.github/workflow-templates/`. Les workflows actifs et leur rétention sont décrits dans [CI et releases](deployment.md). Les anciens caches amont ont été supprimés ; ils restent reconstructibles.

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


## Distribution technique native

`config/native-runtime.json` épingle le tag, le SHA-256 du manifeste et la relocalisation vérifiée du chemin de recette. Le script de restauration vérifie le manifeste, chaque source native et chaque binaire (taille et SHA-256). Aucun téléchargement « latest ». Le dépôt privé exige GitHub CLI authentifié ; en CI, GH_TOKEN est le jeton du job.

Pour une nouvelle distribution : reconstruire avec `engine/native/build/build.sh`, exécuter les suites natives et navigateur, produire artifact.json (sourceRevision, sourceFiles avec SHA-256, files avec tailles et SHA-256 et références de validation), conserver ces fichiers dans un commit temporaire de distribution. Créer un nouveau tag/release technique, actualiser le verrou, puis lancer « Publish verified native distribution » avec le SHA complet du commit d’artefacts. Le workflow vérifie et publie les fichiers sans écraser un fichier existant. Restaurer la nouvelle release sur un environnement vide puis valider la CI avant de supprimer la branche temporaire. Le tag et les fichiers déjà publiés ne sont jamais déplacés.

Les ZIP du studio, la release native, l’archive des sources et les caches CI ont des rôles distincts. Les caches ne sont pas des sauvegardes. Les reçus historiques restent attachés à leurs révisions.
