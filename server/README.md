# Édition serveur ALWIS

Ce dossier contient le serveur HTTP Node.js, la page `/admin/server`, le `Dockerfile`, le Compose et le modèle `.env`. Le serveur sert le paquet statique ALWIS et conserve ses réglages dans SQLite.

Pour l’installation, les variables, le secret administrateur, le reverse proxy et les mises à jour, suivez le [guide Hébergement et publication](../docs/deployment.md). Il contient le Compose complet, maintenu en synchronisation avec [`compose.yaml`](compose.yaml).

Le Compose utilise `ALWIS_ADMIN_PASSWORD` directement dans l’environnement, monte par défaut le dossier hôte `./data` sous `/data` et n’a besoin ni d’un fichier de mot de passe ni d’un volume Docker nommé. Le mot de passe reste dans `.env`, à protéger et à exclure de Git.

L’image publiée est disponible sur [GitHub Packages](https://github.com/Bastian-Noel/ALWIS/pkgs/container/alwis-server). `latest` pointe sur la dernière publication serveur ; les tags de version et de révision restent disponibles pour figer un déploiement. L’image n’exécute pas PHP ni MariaDB sur l’hôte : ces moteurs restent dans le navigateur. La configuration serveur et le partage collaboratif ont des périmètres distincts ; cette distribution n’active pas encore la collaboration en direct.
