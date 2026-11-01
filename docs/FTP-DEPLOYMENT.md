# Publication statique sur FTP avec GitHub Actions

Workflow : **Publish FTP - validated studio** (`.github/workflows/publish-ftp.yml`). Lancement manuel uniquement depuis Actions → workflow → Run workflow. Aucun push ne déclenche une publication FTP.

Le job installe les dépendances npm épinglées, construit les éditeurs, vérifie les tests Node, assemble le site statique et l'ouvre réellement dans Chromium et Firefox avant l'envoi FTP. Le module PHP/MariaDB provient du dernier build natif validé, conservé sur la branche `studio-native-runtime`. Son hash et les empreintes des sources C doivent correspondre ; une modification native oblige à recompiler/valider avant publication. Ce job court ne prétend pas recompiler MariaDB à chaque publication d'interface.

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
