# Édition serveur ALWIS

[Voir le paquet sur GitHub](https://github.com/Bastian-Noel/ALWIS/pkgs/container/alwis-server) · [Configurer et lancer avec Docker Compose](deployment.md)

L’édition serveur distribue la même interface ALWIS derrière un conteneur Node.js et ajoute `/admin/server` pour configurer l’instance. Le tag `latest` suit la dernière publication du conteneur ; les tags numérotés permettent de rester sur une version précise.

Le conteneur ne lance pas PHP ni MariaDB : ces moteurs, ainsi que les projets et leurs fichiers, restent dans le navigateur. SQLite conserve uniquement les réglages de l’instance. Le partage collaboratif en direct n’est pas encore inclus ; son périmètre est décrit dans la [spécification P2P](collaboration-p2p-specification.md).

Les paramètres Compose, variables d’environnement, secret administrateur, reverse proxy, mises à jour et sauvegarde sont regroupés dans le [guide Hébergement et publication](deployment.md).
