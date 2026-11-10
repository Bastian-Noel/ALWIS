# Distribution, CI et publication

## Deux éditions

ALWIS distribue deux artefacts distincts. Le **ZIP statique** se publie sur le FTP comme auparavant. L’**édition serveur** est une image Docker Node.js qui sert ce même paquet et ajoute une page d’administration sous `/admin/server`; sa configuration durable utilise SQLite. Les moteurs PHP et MariaDB restent dans le navigateur et le serveur ne reçoit pas les projets enregistrés par l’utilisateur.

Après la réussite du workflow manuel `Publish FTP - validated studio`, le workflow `Publish ALWIS server container` télécharge l’artefact statique exact, vérifie son manifeste, puis construit et publie l’image correspondante dans GitHub Container Registry. Les deux builds sont séparés et ordonnés. Cette page regroupe les réglages Compose et les déploiements ; [la page serveur](server-deployment.md) résume uniquement le rôle et les limites de cette édition.

## Déployer l’édition serveur avec Docker Compose

Le Compose recommandé est réduit à l’image, l’URL publique et au mot de passe d’administration. Il utilise `latest` et garde les tags numérotés disponibles dans [GitHub Packages](https://github.com/Bastian-Noel/ALWIS/pkgs/container/alwis-server) pour figer une version. Le port hôte et le dossier de données ont des valeurs par défaut.

Le fichier [`server/compose.yaml`](../server/compose.yaml) :

```yaml
services:
  alwis:
    image: ${ALWIS_SERVER_IMAGE:-ghcr.io/bastian-noel/alwis-server:latest}
    init: true
    restart: unless-stopped
    read_only: true
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    user: "10001:10001"
    environment:
      PUBLIC_BASE_URL: ${PUBLIC_BASE_URL:?Définissez PUBLIC_BASE_URL dans .env}
      TRUST_PROXY: ${TRUST_PROXY:-true}
      ALWIS_PREVIEW_ORIGIN: ${ALWIS_PREVIEW_ORIGIN:-}
      ALWIS_ADMIN_PASSWORD: ${ALWIS_ADMIN_PASSWORD:?Définissez ALWIS_ADMIN_PASSWORD dans .env}
    ports:
      - "127.0.0.1:${ALWIS_PORT:-3100}:3000"
    volumes:
      - ${ALWIS_DATA_DIR:-./data}:/data
    tmpfs:
      - /tmp:size=16m,uid=10001,gid=10001,mode=1770
    pids_limit: 128
    healthcheck:
      test: ["CMD", "node", "--disable-warning=ExperimentalWarning", "-e", "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    stop_grace_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

Depuis une copie du dépôt, préparez le `.env` minimal :

```bash
cd server
cp .env.example .env
```

Il contient les deux valeurs à fournir :

```dotenv
PUBLIC_BASE_URL=https://alwis.example.org
ALWIS_ADMIN_PASSWORD=
```

Générez le mot de passe avec `openssl rand -hex 32`, collez la sortie dans `.env`, puis protégez le fichier avec `chmod 600 .env`. Compose passe le mot de passe directement dans `ALWIS_ADMIN_PASSWORD`; aucun fichier de mot de passe ni secret Docker n’est utilisé. Ne versionnez jamais `.env`. Les personnes ayant accès à l’hôte Docker peuvent lire l’environnement du conteneur avec `docker inspect`.

Le bind mount conserve SQLite dans `./data` à côté de `compose.yaml`, monté sous `/data` dans le conteneur. Préparez ses permissions pour l’utilisateur non-root :

```bash
mkdir -p data
sudo chown 10001:10001 data
```

Vérifiez la configuration puis démarrez et contrôlez le service :

```bash
docker compose config
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 alwis
```

Ouvrez `https://alwis.example.org/admin/server` derrière HTTPS. Le reverse proxy doit conserver les en-têtes COOP/COEP nécessaires à WebAssembly. Le port publié reste lié à `127.0.0.1`. Utilisez `docker compose logs -f --tail=100 alwis` pour diagnostiquer et `docker stats alwis` pour observer les ressources.

| Priorité | Variable | Type et valeur conseillée | Rôle |
|---|---|---|---|
| Obligatoire | `PUBLIC_BASE_URL` | URL HTTPS publique ; HTTP permis sur localhost | Adresse canonique de l’instance. Le Compose refuse de démarrer si elle n’est pas définie. |
| Obligatoire | `ALWIS_ADMIN_PASSWORD` | Au moins 20 octets ; `openssl rand -hex 32` produit 32 octets aléatoires | Mot de passe HTTP Basic de `/admin/server`, transmis directement dans l’environnement du conteneur. |
| Recommandée | `ALWIS_PORT` | Entier, `3100` par défaut | Port hôte auquel se connecte le reverse proxy. Le service n’écoute publiquement que sur la boucle locale; le port interne reste `3000`. |
| Recommandée | `ALWIS_DATA_DIR` | Dossier hôte, `./data` par défaut | Répertoire bind-mounté vers `/data` dans le conteneur. Il conserve la base SQLite des réglages; l’UID conteneur `10001` doit pouvoir y écrire. |
| Optionnelle | `ALWIS_SERVER_IMAGE` | `ghcr.io/bastian-noel/alwis-server:latest` par défaut | Permet de choisir un tag de version précis au lieu de `latest`. Les tags sont listés dans [GitHub Packages](https://github.com/Bastian-Noel/ALWIS/pkgs/container/alwis-server). |
| Optionnelle | `TRUST_PROXY` | Booléen, `true` dans ce Compose derrière le proxy local | Lit `X-Forwarded-Proto` pour reconnaître HTTPS après terminaison TLS. Mettez `false` si aucun proxy de confiance n’est utilisé. |
| Optionnelle | `ALLOWED_ORIGINS` | Origines HTTPS exactes, séparées par des virgules ; vide par défaut | À configurer seulement si l’interface et l’API sont servies depuis des origines différentes. L’origine de l’instance est déjà autorisée. |
| Optionnelle | `ALWIS_ADMIN_USER` | `admin` par défaut | Nom utilisé avec le mot de passe pour l’authentification d’administration. |
| Diagnostic | `ALWIS_LOG_LEVEL` | `info` par défaut ; `warn` ou `error` pour réduire le journal | Niveau initial des logs. Les changements enregistrés dans `/admin/server` sont ensuite conservés dans SQLite. Les commandes `docker compose logs` et `docker stats` servent au diagnostic. |
| Avancée | `PORT`, `HOST` | `3000` et `0.0.0.0` dans l’image | Port et interface internes du serveur. Gardez ces valeurs sauf si vous modifiez également le port publié et le healthcheck. |

`ALLOWED_ORIGINS`, `ALWIS_ADMIN_USER` et `ALWIS_LOG_LEVEL` ne figurent pas dans le Compose minimal : ajoutez-les sous `environment` uniquement si nécessaire. `ALWIS_DATA_DIR` désigne ici le chemin hôte du bind mount; l’application continue d’utiliser `/data` dans le conteneur. Le serveur accepte les niveaux `info`, `warn` et `error`, sans mode `debug` verbeux.


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

Les contrôles sont définis une seule fois dans `.github/actions/validated-studio/action.yml`. Les actions externes sont épinglées par commit. Les essais natifs historiques ne font plus partie des workflows actuels ; leurs sources restent dans les anciens commits.

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
