# Paquet statique de test du studio

Le site se prépare sans serveur PHP distant : PHP et MariaDB sont compilés dans le moteur WASM et exécutés dans le navigateur. Les projets restent dans le stockage de ce navigateur après sauvegarde.

```bash
node scripts/package-studio.mjs
node scripts/serve-site-package.mjs
# http://127.0.0.1:8090
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

Les Workers pthreads SQL sont maintenant chargés au premier besoin SQL, et leur nombre reste borné à 16 dans ce profil. Les observations du paquet sont 0 Worker auxiliaire avant SQL, puis 16 créés ; le pic observé vaut 15 sur les deux navigateurs lors du dernier passage. Cela ne constitue pas encore une mesure du gain de RAM globale. Le démarrage conserve la même requête PHP : le compteur écrit avant PDO passe de 1 à 2 sur deux requêtes, sans rejeu automatique.
