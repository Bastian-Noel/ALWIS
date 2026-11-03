# Reprendre ALWIS en local — 3 novembre 2026

Il ne faut pas refaire le projet : les sources actuelles sont commitées sur `main`. Ce document transmet l’état technique et les règles utiles à une nouvelle conversation. Il s’agit d’une synthèse de reprise, pas d’un export mot à mot de la conversation.

## 1. Sauver les projets du navigateur

Dans l’ALWIS actuellement utilisé, exporter chaque projet en ZIP. Les fichiers PHP, bases SQL et brouillons sont dans le stockage du navigateur pour cette origine, **pas dans le workspace cloud et pas dans GitHub**. Un changement d’adresse vers localhost ne les transfère pas. Les cookies/sessions clientes ne sont pas compris dans l’export ZIP du projet. Garder l’ancien site accessible jusqu’à avoir vérifié les imports.

Ne pas effacer les données du site pour actualiser son interface.

## 2. Repartir d’une copie locale propre

Utiliser un nouveau dossier ; conserver toute ancienne copie qui contient des modifications. Aucun `reset --hard`, `clean -fdx` ou effacement du stockage n’est nécessaire.

Prévoir Node 24 recommandé, npm, Python 3 et Git. GitHub CLI permet de télécharger les releases épinglées. Sous Arch, les paquets usuels sont `git`, `nodejs`, `npm`, `python` et `github-cli` ; vérifier les versions avant d’installer.

```bash
git clone https://github.com/Bastian-Noel/ALWIS.git
cd ALWIS
npm ci
# Si GitHub CLI demande une connexion : gh auth login
python3 scripts/restore-deployment-engine.py
npm run editor:build
node scripts/serve-studio.mjs
```

Ouvrir http://127.0.0.1:8080. Importer les ZIP de projets dans l’accueil. Le serveur local sert les fichiers et les en-têtes COOP/COEP ; PHP et MariaDB tournent dans le navigateur.

**Cette reprise ne demande pas de recompiler PHP/MariaDB ni d’installer Emscripten.** Le moteur validé est téléchargé depuis une release technique et ses sources/empreintes sont contrôlées.

Le serveur de développement affiche `développement`. Le numéro de version et la révision de production sont injectés au packaging :

```bash
node scripts/package-studio.mjs
node scripts/serve-site-package.mjs
```

Le paquet s’ouvre par défaut sur http://127.0.0.1:8090. Un ZIP applicatif déjà publié peut également être extrait puis lancé avec `node serve.mjs` (port 8080).

## 3. Utiliser l’archive cloud de reprise

L’archive privée `ALWIS-reprise-2026-11-03.zip` est organisée ainsi :

- `alwis-main.bundle` : sources et historique accessibles depuis `main`, sans configuration d’authentification Git ;
- `cloud-cache/` : fichiers ignorés prêts à recopier dans le clone — moteur natif vérifié, éditeurs compilés et dépendances WASM de construction des éditeurs ;
- `native-source/` : sources PHP préparées sans objets compilés, modifications MariaDB et versions amont nécessaires pour les retrouver ;
- `cloud-evidence/` : reçus et journaux techniques sélectionnés ;
- `PROMPT_REPRISE.txt`, ce guide et un inventaire des fichiers avec leurs empreintes.

Après extraction, depuis le dossier `ALWIS-reprise` :

```bash
git bundle verify alwis-main.bundle
git clone --branch main alwis-main.bundle ALWIS-local
cp -a cloud-cache/. ALWIS-local/
cd ALWIS-local
git remote set-url origin https://github.com/Bastian-Noel/ALWIS.git
npm ci
python3 scripts/restore-deployment-engine.py
node scripts/serve-studio.mjs
```

Les éditeurs sont déjà compilés dans cette archive. Pour les modifier : `npm run editor:build`. npm et les navigateurs de test restent à télécharger ; l’archive n’est pas une machine virtuelle entièrement hors ligne.

Les anciens objets CMake, SDK, `node_modules`, navigateurs Playwright et caches apt/npm ne sont pas une sauvegarde portable utile. Ils se réinstallent. Les fichiers de configuration natifs historiques contiennent des chemins cloud absolus : reconfigurer avant toute recompilation locale, ne pas lancer aveuglément leurs anciens Makefiles.

## 4. Vérifier la reprise

```bash
npm test
mkdir -p build-work/php
npm install --prefix build-work/php --no-package-lock --ignore-scripts playwright@1.64.1
build-work/php/node_modules/.bin/playwright install chromium firefox
node tests/browser/editor-intelligence.mjs
node tests/browser/alwis-workbench.mjs
node scripts/package-studio.mjs
node tests/browser/site-package.mjs
node tests/browser/site-updates.mjs
```

Sous Linux, si Playwright signale des bibliothèques système manquantes, installer les dépendances du navigateur adaptées à sa distribution ; `install --with-deps` cible les distributions prises en charge par Playwright, pas automatiquement Arch. Les tests utilisent leurs propres ports temporaires.

Pour les sources natives : `engine/native/build/README.md`, `CONTRIBUTING.md`, `config/native-runtime.json`. `scripts/setup-cloud.sh` est une recette Debian 13 cloud ; **ne pas l’utiliser comme installation Arch**. Elle contient aussi des références historiques à des artefacts Actions expirables. Le chemin recommandé pour la reprise quotidienne est la restauration de la release technique, pas cette ancienne préparation complète.

## 5. État livré

- Dépôt : `Bastian-Noel/ALWIS`, anciennement `WASMWebServer`. Le dossier cloud a gardé l’ancien nom ; plusieurs noms internes PBL sont conservés pour la compatibilité.
- Dernière application publiée : `v0.3.0-preview.3`, build `524705a2ba564abdd96d367e742ef18e0b2e72eb`.
- Dernier HEAD avant cette transmission : `ddd79b68c05491a543e86d9835f00c3801ae0b7f` ; les différences après le build sont documentaires. Le bundle de reprise porte le HEAD réel indiqué dans son inventaire.
- CI réussie : https://github.com/Bastian-Noel/ALWIS/actions/runs/41606748699
- Build, release puis FTP réussis : https://github.com/Bastian-Noel/ALWIS/actions/runs/41606772988
- Moteur épinglé : `native-runtime-2026-11-03-stability`, PHP 8.4.27, Emscripten 6.0.6. Les empreintes autoritatives sont dans `config/native-runtime.json` et le manifeste de cette release.

L’interface principale est le workbench dans `apps/studio/workbench/`, relié directement à `ProjectHub`, au runtime propriétaire et au stockage navigateur. L’ancienne interface a été retirée. L’archive de design reçue autrefois n’est plus nécessaire pour reconstruire l’interface implémentée.

### Éditeur

CodeMirror 6, PHPantom WASM pour PHP, SuperHTML, SWC/TypeScript pour JavaScript et définitions jQuery internes. Les définitions n’injectent pas la bibliothèque jQuery dans les projets.

Snippets locaux `for`/`foreach`/`while` disponibles sans attendre le service de langage ; Tab insère et parcourt les champs. Entrée n’accepte pas une suggestion. Emmet se développe par Tab ou bouton en contexte HTML/CSS ; `!` puis Entrée crée un squelette HTML. Dans un bloc PHP ou une chaîne, Emmet ne doit pas produire du HTML. Une aide explique les contextes invalides.

Formateur Prettier et plugin PHP dans un worker chargé à la demande puis terminé : PHP, HTML, JS/JSX, CSS et JSON. Bouton/menu et Alt+Maj+F ; indentation 2/4 espaces ou tabulations. Pas de Ctrl+Maj+I réservé au navigateur. Limite 256 K caractères/10 secondes, résultat périmé ignoré, erreurs conservant le brouillon, annulation possible. SQL et TypeScript n’ont pas de formateur dans ce lot. Les diagnostics sémantiques PHP ne sont pas exhaustifs.

### PHP, PDO, MySQLi, mémoire

Un moteur WASM commun PHP/MariaDB et un pont natif C, PDO/MySQLi partageant le backend. Un projet PHP vide n’initialise pas SQL ; SQL démarre au besoin. Le redémarrage du runtime préserve l’état enregistré. Ne pas annoncer un arrêt/redémarrage isolé de MariaDB comme une fonctionnalité acquise.

106 entrées procédurales MySQLi sont enregistrées, ce qui **ne signifie pas 106 implémentations entièrement conformes**. Six API restent explicitement refusées. Consulter `packages/php-native/COMPATIBILITY.md`, l’inventaire et les reçus sous `engine/fusion/`.

Un défaut reproduit a été corrigé en C : fermer une connexion libère les chunks `send_long_data` même si les statements PHP restent vivants. PDO natif/émulé, transactions, erreurs, curseurs, BLOB et décimaux exacts ont des tests croisés. Les budgets de résultats, requêtes, connexions et statements sont bornés. Douze requêtes de stabilité ne constituent ni une endurance générale ni une mesure de RAM totale du navigateur. Une mémoire linéaire WASM agrandie ne rétrécit pas automatiquement ; ne pas confondre allocateur C, capacité WASM et PSS/RAM navigateur.

### SQL et campus

Grille, schéma relationnel, relations composées par glisser-déposer, structure/colonnes/index/contraintes et valeurs exactes sont reliés au moteur. La parité exhaustive phpMyAdmin n’est pas revendiquée ; garder les limites documentées.

Le nouvel exemple Campus est créé uniquement dans les **nouveaux projets** : 34 tables non vides, 40 clés étrangères, dix profils et quatre sessions préparées. Profils indépendants, carnet partagé, notes et messagerie, transaction annulée après destinataire invalide, sauvegarde/restauration vérifiées dans Chromium/Firefox. Les profils librement sélectionnables sont pédagogiques, pas une authentification de production. Voir `docs/school-example.md`.

Un défaut réel de formulaires a aussi été corrigé : un champ nommé `action` masquait `form.action`. Le runtime client lit désormais les attributs et préserve les surcharges du bouton de soumission.

### Versions et publication

Assets regroupés sous `/_alwis/<révision>/`, imports et workers réécrits à l’assemblage ; version et build affichés en bas. `release.json` est promu en dernier. Détection des nouvelles versions puis commande de mise à jour conservant brouillons et projets. La bascule entre deux vrais arbres d’assets est testée dans Chromium/Firefox. Pour une ancienne version dépourvue de ce mécanisme, faire une première actualisation forcée.

Une seule action manuelle `publish-ftp.yml`, sur main, avec `version` : validation → release → FTP du même paquet → annotation du transfert. Version du tag et du paquet contrôlée. Le mot de passe reste dans le secret GitHub `FTP_PASSWORD` ; aucun secret n’est à recopier dans le code ou un nouveau prompt. L’intégration locale a rencontré des restrictions sur la création/upload de release : les derniers brouillons ont été préparés via GitHub CLI, puis le runner a joint les assets et publié. Le guide conserve ce repli si un prochain compte reçoit 403.

`FTP_PUBLIC_URL` n’est pas configurée : transfert FTP vérifié ne signifie pas vérification du domaine HTTPS de production. Ne pas inventer d’URL de site.

## 6. Règles pour la prochaine conversation

1. Lire `AGENTS.md` : **main uniquement**, aucune branche technique/temporaire/d’upload. Les binaires vont en artefacts Actions puis releases. La recette native accepte un `artifact_run`, plus une branche contenant les binaires.
2. Garder le design fourni et ses détails pratiques ; ne pas réintroduire une interface simulée ou simplifiée.
3. Faire des avancées concrètes et des vérifications ciblées ; ne pas annoncer une fonctionnalité sur la seule présence d’une API ou d’une compilation.
4. Ne pas remplacer les projets existants par le nouveau template. Ne pas effacer le stockage pour résoudre un cache d’interface.
5. Préserver les limites documentées et mesurer avant d’annoncer un gain mémoire ou une compatibilité complète.
6. Ne pas republier automatiquement pour une simple reprise locale. Attendre une demande de nouveau changement/publication ; le dernier site publié est déjà fonctionnel dans les parcours vérifiés.

Première étape conseillée : lancer la copie locale, importer un projet ZIP, vérifier l’éditeur et le nouveau campus, puis choisir la prochaine amélioration à partir des limites réelles. Les anciennes conversations de `provenance/` sont historiques ; les corrections récentes et ce bilan priment sur leurs anciens objectifs.
