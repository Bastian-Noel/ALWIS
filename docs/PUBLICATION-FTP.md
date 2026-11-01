# Publication FTP : état vérifié au 1 novembre 2026

Le code, les éditeurs et les guides actuels sont publiés sur la branche `main`. Le module natif validé est conservé séparément sur `studio-native-runtime` ; son checkout de CI est ignoré dans le code source.

Exécution GitHub : [41331506782, tentative 2](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41331506782), source `4400c11c83b53f2e88c83339f43e93af0ccc2f0e`.

| Étape | Résultat réel |
|---|---|
| Restauration du module natif et contrôle de ses sources | Réussis |
| Build statique des éditeurs | Réussi |
| Tests Node | 41 réussis |
| Ouverture réelle du paquet dans Chromium et Firefox | Réussie |
| Conservation du paquet statique | Réussie, artefact 13094000261 (~23,2 Mo compressés) |
| Publication FTP | Réussie lors de la tentative 2, fichiers transférés dans la racine FTP |

[Paquet statique validé](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41331506782/artifacts/13094000261).

Le mot de passe fourni dans la conversation n'a pas été inscrit dans les fichiers Git. La tentative de configuration automatique du secret de dépôt a reçu **HTTP 403 Resource not accessible by integration**, de même que la création d'un environnement GitHub. Aucun autre compte CLI autorisé à gérer ce secret n'était disponible.

Le secret est désormais disponible au runner : la relance a authentifié le compte et publié les fichiers. Pour une réinstallation, configurer le secret **FTP_PASSWORD** dans [Settings → Secrets and variables → Actions](https://github.com/Bastian-Noel/WASMWebServer/settings/secrets/actions/new), puis lancer [Publish FTP - validated studio → Run workflow](https://github.com/Bastian-Noel/WASMWebServer/actions/workflows/publish-ftp.yml). Hôte, port et utilisateur sont déjà renseignés. Le [guide FTP](FTP-DEPLOYMENT.md) décrit les deux variables facultatives et la sauvegarde privée des fichiers remplacés.

Les fichiers ont été transférés sur FTP lors de la tentative 2. L’URL publique doit encore être fournie pour vérifier HTTPS et les en-têtes du véritable hébergement ; cet envoi n’est pas présenté comme un test navigateur en ligne.

## Nettoyage effectué

README recentré, index des guides ajouté, rapports historiques identifiés et versions/capacités actuelles reliées aux preuves. Le répertoire de préparation vide et la première exécution FTP échouée sur l'installation de Firefox ont été supprimés. Le workflow corrigé a ensuite validé les deux navigateurs.

L'audit des releases a trouvé une seule release, `sources-2026-10-31`, contenant les 19 sources amont vérifiées. Elle est utile à la restauration et a été conservée. Les anciens témoins et leurs reçus ne sont pas assimilés à des doublons supprimables ; le nouveau déploiement ne crée pas de release supplémentaire.
