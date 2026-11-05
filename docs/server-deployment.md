# Distribuer ALWIS en mode serveur

ALWIS garde deux distributions distinctes : le ZIP statique pour un hébergement web habituel, et l’image conteneur pour installer ALWIS derrière le reverse proxy de son propre serveur. Les builds ne partagent pas le même artefact : après la validation et la publication FTP du build statique, une seconde action récupère son artefact signé par le manifeste, construit l’image serveur puis la publie dans GitHub Container Registry.

La version serveur de cette première étape contient l’application web et une page protégée de configuration. Le runtime PHP/MariaDB reste dans le navigateur, comme dans la version statique. Les projets restent donc dans le navigateur et ne sont pas placés dans le conteneur. SQLite conserve la configuration du serveur.

## Télécharger et installer le conteneur

Les images publiées apparaissent dans [GitHub Packages](https://github.com/Bastian-Noel/ALWIS/pkgs/container/alwis-server). La première publication cible Linux `amd64`. Si `docker pull` signale un accès refusé, ouvrez **Package settings → Change visibility → Public** dans GitHub Packages, ou connectez Docker avec un compte disposant de `read:packages`. Choisissez un tag de release précis, puis suivez [le guide Docker serveur](../server/README.md). Exemple :

```sh
docker pull ghcr.io/bastian-noel/alwis-server:0.3.0-preview.17
```

Le fichier [`server/compose.yaml`](../server/compose.yaml) limite le service à 640 Mio, n’expose le port qu’à localhost et conserve la configuration dans un volume nommé. La page `/admin/server` permet à l’administrateur de définir l’adresse publique, les origines autorisées, le mode maintenance et le niveau de journal. Le secret d’administration est un fichier Docker monté ; il n’est pas stocké dans l’image ni dans Git.

Le proxy HTTPS doit préserver les en-têtes COOP/COEP utilisés par WASM. Configurez le proxy et son certificat avant d’ouvrir le service sur Internet. Gardez le port de l’application lié à `127.0.0.1`.

## Deux distributions, dans l’ordre

1. Lancez **Publish FTP - validated studio** sur `main` en choisissant un tag de release. Ce workflow construit et valide le paquet statique, publie la release puis met le même paquet à jour sur le site FTP.
2. Après son succès, **Publish ALWIS server container** télécharge l’artefact statique de cette exécution, en contrôle le SHA-256 et la révision, puis construit et pousse l’image serveur correspondante. Pour relancer uniquement cette seconde étape après un incident, fournissez l’ID de la publication statique réussie et son SHA à **Publish ALWIS server container**.

Les deux images portent la même version et révision. Le ZIP statique reste disponible sur la release. Le workflow ajoute aussi la commande `docker pull` correspondante aux notes de cette release. Aucune branche d’upload ni aucun conteneur MariaDB distant n’est ajouté.

## Partage collaboratif

La page d’administration et le conteneur sont la base de la distribution serveur ; ils n’activent pas encore le partage collaboratif live de fichiers, SQL et schéma. La spécification [Collaboration P2P et Docker](collaboration-p2p-specification.md) décrit le serveur Node/Yjs, SQLite, les invitations, les permissions, le transfert WebRTC et les limites de ressources. Elle distingue cette configuration d’instance des fonctions collaboratives à réaliser. Redis n’est pas utilisé : le choix validé est SQLite sans service de base supplémentaire. Le secret d’administration monté doit être lisible par l’UID conteneur `10001` avec le mode `0400`, conformément au [guide d’installation](../server/README.md).

Ne présentez pas encore cette image comme un serveur PHP partagé ou comme une collaboration à six personnes. Le serveur web distribue l’interface ; PHP et MariaDB continuent à s’exécuter dans le navigateur. La suite collaborative nécessite son intégration et sa validation séparées.
