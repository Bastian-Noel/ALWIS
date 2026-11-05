# Distribution serveur ALWIS

Cette variante ajoute un serveur HTTP et une page d’administration au paquet statique ALWIS. Elle ne lance pas PHP ni MariaDB sur l’hôte : ces moteurs s’exécutent toujours en WASM dans le navigateur. Les projets restent dans le stockage du navigateur. Le volume SQLite du conteneur garde uniquement les réglages de cette instance.

L’image est publiée séparément dans GitHub Container Registry après la réussite de la build statique et de son déploiement FTP. La distribution classique reste le ZIP statique de la release ; le build serveur ne la remplace pas.

## Installation

1. Installez Docker Engine et le plugin Docker Compose sur un hôte Linux.
2. Copiez `compose.yaml` et `.env.example` dans un dossier de déploiement, puis renommez `.env.example` en `.env`.
3. Choisissez une version publiée dans [GitHub Packages](https://github.com/Bastian-Noel/ALWIS/pkgs/container/alwis-server) et configurez `ALWIS_SERVER_IMAGE` avec son tag.
4. Configurez `PUBLIC_BASE_URL` avec l’adresse HTTPS prévue dans votre reverse proxy.
5. Créez le secret d’administration :

   ```sh
   mkdir -p secrets
   umask 077
   openssl rand -hex 32 > secrets/admin_password
   sudo chown 10001:10001 secrets/admin_password
   chmod 0400 secrets/admin_password
   ```

6. Démarrez le service :

   ```sh
   docker compose up -d
   docker compose ps
   ```

Configurez le reverse proxy pour transmettre HTTPS vers `127.0.0.1:3100`, relayer les WebSockets si nécessaire, et conserver les en-têtes COOP/COEP requis par WebAssembly. L’image ne publie pas directement son port sur le réseau public.

Ouvrez `https://alwis.example.org/admin/server` pour les réglages de l’instance. L’authentification HTTP demande `ALWIS_ADMIN_USER` et le secret monté dans `secrets/admin_password`. N’exposez cette page qu’en HTTPS. La page permet de définir l’URL publique, les origines autorisées, le mode maintenance et le niveau de journalisation. Ces réglages sont conservés dans `alwis-state`.

## Limites de cette première distribution serveur

Le conteneur sert ALWIS et fournit sa configuration serveur protégée. Le partage collaboratif en direct (Yjs, invitations, rôles, présence, synchronisation SQL et transferts WebRTC/TURN) n’est pas encore activé dans cette version. La spécification et les décisions de quotas sont dans [Collaboration P2P](../docs/collaboration-p2p-specification.md). La base SQLite existante ne constitue pas à elle seule un service de collaboration complet.

Cette édition n’utilise pas Redis : le cahier des charges retient SQLite pour les métadonnées et le Node.js intégré au conteneur. Aucun conteneur MariaDB n’est ajouté sur l’hôte. Redis n’est pas nécessaire pour télécharger ou lancer l’image.

Le plafond Docker du conteneur ALWIS est de 640 Mio. Le budget de 1 Gio de la spécification réserve le reste à coturn, à la marge et aux besoins système ; coturn n’est pas démarré par cette première image. Mesurez l’hôte avant d’augmenter les limites.

## Mettre à jour et sauvegarder

Pour mettre à jour, sélectionnez explicitement le tag souhaité dans `.env`, puis exécutez `docker compose pull && docker compose up -d`. Le volume nommé `alwis-state` conserve les réglages. Sauvegardez ce volume avant les changements de version. Les projets utilisateur se sauvegardent depuis ALWIS avec Exporter ZIP ; ils ne se trouvent pas dans le conteneur.

Pour vérifier : `docker compose exec alwis node --disable-warning=ExperimentalWarning -e "fetch('http://127.0.0.1:3000/readyz').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"`.
