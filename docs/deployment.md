# Distribution, CI et publication

## Deux éditions

ALWIS distribue deux artefacts distincts. Le **ZIP statique** se publie sur le FTP comme auparavant. L’**édition serveur** est une image Docker Node.js qui sert ce même paquet et ajoute une page d’administration sous `/admin/server`; sa configuration durable utilise SQLite. Les moteurs PHP et MariaDB restent dans le navigateur et le serveur ne reçoit pas les projets enregistrés par l’utilisateur.

Après la réussite du workflow manuel `Publish FTP - validated studio`, le workflow `Publish ALWIS server container` télécharge l’artefact statique exact, vérifie son manifeste, puis construit et publie l’image correspondante dans GitHub Container Registry. Les deux builds sont séparés et ordonnés. Les détails d’installation figurent dans [le guide Docker](server-deployment.md) et les limites de la première édition dans [la spécification collaborative](collaboration-p2p-specification.md).

## Déployer l’édition serveur avec Docker Compose

Le dépôt fournit un Compose prêt à l’emploi dans [`server/compose.yaml`](../server/compose.yaml) et son modèle de variables dans [`server/.env.example`](../server/.env.example). Il lance une image publiée et versionnée, conserve les réglages serveur dans un volume SQLite, lie le port à `127.0.0.1` et fixe par défaut une limite de 640 Mio et 0,75 CPU. Le navigateur exécute toujours PHP et MariaDB ; ce conteneur sert l’interface et sa page d’administration.

Depuis une copie du dépôt :

```bash
cd server
cp .env.example .env
```

Dans `.env`, choisissez le tag précis de l’image et l’adresse HTTPS que vous configurerez sur le reverse proxy :

```dotenv
ALWIS_SERVER_IMAGE=ghcr.io/bastian-noel/alwis-server:0.3.0-preview.17
PUBLIC_BASE_URL=https://alwis.example.org
ALWIS_LOCAL_PORT=3100
ALLOWED_ORIGINS=
TRUST_PROXY=true
ALWIS_ADMIN_USER=admin
ALWIS_MEMORY_LIMIT=640m
ALWIS_MEMORY_RESERVATION=256m
ALWIS_MEMORY_SWAP=640m
ALWIS_CPUS=0.75
```

Le tag ci-dessus est un exemple : remplacez-le par le tag de release que vous voulez installer. Laissez `ALLOWED_ORIGINS` vide pour un déploiement de même origine ; si l’interface et le serveur ont des origines différentes, indiquez uniquement les origines HTTPS exactes, séparées par des virgules. Gardez `TRUST_PROXY=true` seulement derrière votre reverse proxy de confiance ; sinon mettez `false`. Le port reste publié sur localhost, même si l’URL publique passe par le proxy.

Créez le secret d’administration hors du dépôt :

```bash
mkdir -p secrets
umask 077
openssl rand -hex 32 > secrets/admin_password
sudo chown 10001:10001 secrets/admin_password
chmod 0400 secrets/admin_password
```

Vérifiez la configuration interpolée, puis démarrez et contrôlez le service :

```bash
docker compose config
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 alwis
```

Ouvrez ensuite `https://alwis.example.org/admin/server` derrière HTTPS. Le reverse proxy doit transmettre les en-têtes COOP/COEP nécessaires à WebAssembly. Le tag de l’image, la limite mémoire et le nombre de CPU sont configurables dans `.env` ; conservez le profil par défaut au départ et ajustez les ressources seulement après observation de `docker stats` et des journaux. Les noms et valeurs de toutes les variables sont détaillés dans le [modèle `.env`](../server/.env.example) et le [guide de déploiement serveur](server-deployment.md).


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

La validation du paquet, le transfert FTP et la vérification du domaine public sont trois preuves distinctes. Le workflow FTP publie sur l’hébergement configuré ; l’accès HTTPS et les en-têtes COOP/COEP sont vérifiés seulement si `FTP_PUBLIC_URL` est renseigné. Aucun déploiement Sites ou Cloudflare n’est utilisé.

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

Envoi passif dans un dossier temporaire, contrôle des tailles, sauvegarde privée des fichiers remplacés comme artefact GitHub, puis renommage fichier par fichier : assets immuables d’abord, index.html ensuite, release.json en dernier. Les assets sont isolés sous `/_alwis/<révision>/` : un onglet garde un graphe cohérent même pendant l’envoi d’une autre version. Aucun ancien fichier de projet n'est supprimé. Cette promotion est atomique par fichier ; elle ne garantit pas une bascule transactionnelle de tout le site. Les anciens fichiers sont disponibles sept jours dans l'artefact privé `ftp-previous-site-*`.

Le site statique validé est conservé quatorze jours dans l'artefact `studio-static-*`, même si FTP échoue. Une publication FTP réussie sans URL publique n'est pas présentée comme un test navigateur du site en ligne.

Un bloc Apache `.htaccess` géré est ajouté en conservant les règles existantes : MIME WASM, COOP same-origin, COEP require-corp et index.html. Nginx ignore `.htaccess` et doit fournir ces en-têtes dans sa configuration serveur. L'outil PHP d'export SQL est distribué comme **sql-export.source.txt** ; un hébergeur disposant de PHP ne doit jamais l'exécuter côté serveur.

Le FTP doit accepter les connexions passives et les renommages. Le protocole demandé est FTP sur le port 21 ; l'authentification n'est pas assimilée à du FTPS. Depuis l'environnement cloud de préparation, le port direct était refusé et le proxy expirait sans bannière ; le runner GitHub effectue donc son propre test réel.

## Versionner le paquet publié

Un seul champ manuel, `version`, et un seul workflow : **build et tests → release publiée → transfert FTP du même paquet → annotation du succès FTP**. Une release disponible ne prouve pas que son transfert a réussi : la fin du job `publish` et les notes mises à jour le confirment. Le script vérifie le SHA et les empreintes ; il ne reconstruit pas entre release et FTP.


## CI et versions

Trois workflows sont actifs ; aucun ne crée de branche :

| Workflow | Déclenchement | Rôle |
|---|---|---|
| CI - validated studio | Push main, pull request, manuel | Build et validations partagées ; les changements Markdown seuls sont ignorés |
| Publish FTP - validated studio | Manuel, main uniquement | Build validé, release puis transfert FTP du même paquet |
| Publish verified native distribution | Manuel, main uniquement | Consomme un artefact Actions validé, sans checkout de branche d’upload |

Les contrôles sont définis une seule fois dans `.github/actions/validated-studio/action.yml`. Les actions externes sont épinglées par commit. Les anciennes recettes de témoins et d'archivage des sources sont conservées dans `.github/workflow-templates/`, sans exécution automatique. Elles ne sont pas des contrôles quotidiens du studio custom.

## Publier une version

Dans **Publish FTP - validated studio → Run workflow**, choisir `main` et renseigner `version` (par exemple `v0.3.0-preview.3`, correspondant à la version de `package.json`). L’action construit et valide les sources, publie le ZIP en release, puis déploie ce paquet exact sur FTP. Si FTP échoue après la release, relancer les jobs échoués : aucun besoin de reconstruire ou de remplacer la release.

Une version publiée ne peut pas être remplacée par ce script ; choisir un nouveau numéro. Le script peut reprendre un brouillon correspondant à la même source. Les versions stables deviennent la dernière release ; les suffixes alpha/beta/rc/preview restent des préversions. Une version stable nommée reste soumise aux limites fonctionnelles documentées du prototype.

La création initiale de release avec le jeton du runner a reçu HTTP 403 dans ce dépôt, malgré `contents: write`. Préparer le tag seul n'a pas suffi. Pour v0.1.0, le brouillon a été créé avec l'intégration GitHub autorisée, sur **la révision validée**, puis le workflow a réussi l'ajout des trois pièces jointes et la publication. Si ce refus revient, un mainteneur prépare le brouillon avec le même tag et la même révision, puis relance les jobs échoués du workflow. Ne pas déplacer un tag publié vers une autre source.

## Conservation

Les paquets Actions expirent après 14 jours et les sauvegardes FTP après 7 jours. Les pièces jointes d'une release constituent la distribution durable. Les caches accélèrent les jobs sans constituer une preuve de validation. Les six anciens caches amont supprimés représentaient 405 373 660 octets.

L'archive `sources-2026-10-31` est une archive de provenance séparée, identifiée comme telle et exclue de la dernière release applicative. La supprimer casserait la restauration des sources. Les reçus historiques et les licences sont conservés ; l'historique Git n'est pas réécrit.

Première version publiée : [v0.1.0](https://github.com/Bastian-Noel/ALWIS/releases/tag/v0.1.0), [exécution de versionnement réussie](https://github.com/Bastian-Noel/ALWIS/actions/runs/41334230705).

Préversion actuelle : **[ALWIS v0.3.0-preview.16](https://github.com/Bastian-Noel/ALWIS/releases/tag/v0.3.0-preview.16)**, construite depuis `main` au commit `3aa5250ef32f1e7e270b7744b079dc6741f64683` et publiée par l’[action unique build → release → FTP](https://github.com/Bastian-Noel/ALWIS/actions/runs/42075314313). Le paquet a réussi les parcours réels Chromium et Firefox, dont le Campus (14 tables, 18 relations, quatre sessions, notes par devoir, PDO/MySQLi, messages et upload). Le site public `https://studio.mmi.place/` sert le manifeste de cette révision, les en-têtes COOP/COEP et la carte sociale 1200 × 630 dont l’empreinte correspond au paquet.

Préversion précédente : **[ALWIS v0.3.0-preview.2](https://github.com/Bastian-Noel/ALWIS/releases/tag/v0.3.0-preview.2)**, source `0df9f51e384c81656c5c4d94b7d96c2042ef5452`, [CI réussie](https://github.com/Bastian-Noel/ALWIS/actions/runs/41601016549), [publication FTP et release](https://github.com/Bastian-Noel/ALWIS/actions/runs/41601053670). Elle ajoute le formateur chargé à la demande, ses commandes visibles, le réglage d’indentation, les snippets locaux immédiats et la priorité d’Emmet sur Tab. Le parcours du paquet statique exerce aussi le chargement réel du formateur dans les deux navigateurs.

Préversion précédente : **[ALWIS v0.3.0-preview.1](https://github.com/Bastian-Noel/ALWIS/releases/tag/v0.3.0-preview.1)**, source `a47f701056a64fe9ef5cd5927787e94c8a2bdd9c`, [CI réussie](https://github.com/Bastian-Noel/ALWIS/actions/runs/41597218729), [build, FTP et release réussis](https://github.com/Bastian-Noel/ALWIS/actions/runs/41597778920) le 3 novembre 2026. Elle contient la nouvelle interface ALWIS et le moteur natif consolidé PDO/MySQLi. Le ZIP applicatif, les reçus de validation et `SHA256SUMS` sont joints à la release. `FTP_PUBLIC_URL` n’étant pas renseigné, le domaine HTTPS et ses en-têtes ne sont pas vérifiés par cette publication.

Les sources restent uniquement sur `main` ; les builds natifs et applicatifs sont conservés dans les releases, sans branche d’upload. Les modifications documentaires ultérieures ne changent pas la révision du paquet publié.

Préversion historique de la refonte IDE : [v0.2.0-preview.2](https://github.com/Bastian-Noel/ALWIS/releases/tag/v0.2.0-preview.2), source `19b6ee0`, [CI réussie](https://github.com/Bastian-Noel/ALWIS/actions/runs/41337154626), [FTP et release réussis](https://github.com/Bastian-Noel/ALWIS/actions/runs/41337170552). La préversion intermédiaire de ce lot et son tag ont été retirés après validation de la version corrigée.


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

## Versions du site et mises à jour complètes

Le paquet expose la version et le SHA en bas de page. Les modules, styles, workers et WASM utilisent le même préfixe de build ; les importations absolues internes sont réécrites à l’assemblage et les empreintes portent sur les fichiers réellement livrés. `release.json` est publié après tous les fichiers et consulté sans cache à l’ouverture, au retour dans l’onglet et chaque minute.

Une nouvelle version fait apparaître **Mettre à jour**. Le bouton conserve les brouillons de l’atelier, sauvegarde les fichiers appliqués et SQL, ferme le propriétaire et recharge l’accueil du nouveau build. Les espaces de stockage des projets ne sont ni effacés ni assimilés aux caches de l’application. Les anciennes adresses d’assets restent présentes pour les onglets déjà ouverts ; elles consomment de l’espace d’hébergement tant qu’elles sont conservées. Le test `site-updates.mjs` exerce une vraie bascule entre deux arbres d’assets dans Chromium et Firefox, puis rouvre le projet et distingue le brouillon du PHP appliqué.

La recette native accepte désormais uniquement un `artifact_run` numérique, issu d’une exécution réussie sur `main`, contenant `native-distribution`. Aucune référence Git d’upload, aucun commit orphelin et aucune branche `native-stability` ne sont nécessaires. Les futures compilations natives doivent conserver leurs binaires comme artefacts Actions puis releases, pas dans une branche technique.
