# Règles du dépôt ALWIS

- Travailler sur `main` uniquement, selon la demande explicite du propriétaire. Ne créer aucune branche technique, temporaire ou d’upload, notamment `native-stability` et `native-stability-upload`.
- Conserver les builds dans les artefacts GitHub Actions puis les releases. La publication native consomme un identifiant d’exécution validée sur `main`, jamais une branche contenant des binaires.
- Publier par `publish-ftp.yml` : un build validé, une release, puis le transfert FTP du même paquet. Les secrets restent dans GitHub Actions.
- Vérifier les parcours réels Chromium/Firefox et le paquet statique ; la version visible doit correspondre au manifeste et au tag. Ne jamais effacer les projets pour actualiser les fichiers du site.
