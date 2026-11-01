# Publication et nettoyage vérifiés — 1 novembre 2026

Le build statique de la source `355952c688171eb1a7aa4680d5b577d05070d9e2` a passé la [CI](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41332776634) et la [publication FTP](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41332776511). Le transfert FTP vers la racine est réussi ; le secret est correctement disponible dans GitHub Actions.

Les contrôles partagés vérifient les empreintes du moteur natif et ses sources C, construisent les éditeurs, exécutent les 41 tests Node et les contrôles C/Python, puis les scénarios réels Chromium/Firefox, les services de langage, les éditeurs, les API MySQLi et l'accessibilité. Le paquet conserve un manifeste des fichiers et de leurs empreintes.

La version [v0.1.0](https://github.com/Bastian-Noel/WASMWebServer/releases/tag/v0.1.0) correspond à cette source validée, avec le site statique, les reçus et SHA256SUMS. Elle reste un prototype avec les restrictions documentées ; ce nom ne signifie pas une parité exhaustive avec PHP/MySQL natifs.

L'URL publique n'est pas configurée : HTTPS et les en-têtes du véritable domaine restent à vérifier. Un transfert FTP réussi ne constitue pas ce contrôle navigateur en ligne.

## Nettoyage

- Deux workflows actifs : CI et publication FTP manuelle. Les trois anciennes recettes amont sont archivées hors des workflows actifs pour préserver la possibilité de reconstruction.
- Six caches amont obsolètes supprimés : 405 373 660 octets. Les caches actuels sont conservés.
- README et index recentrés, rapports historiques identifiés, sorties générées et checkout du moteur exclus des sources Git.
- L'archive `sources-2026-10-31` est conservée et classée séparément comme préversion d'archive, explicitement sans être une version du studio. Ses sources épinglées et licences sont nécessaires à la reproduction.

Il n'existait pas d'ancienne release applicative inutile à supprimer. Les reçus, licences et preuves historiques utiles restent conservés. Aucun historique Git n'a été réécrit.

Voir le [guide FTP](FTP-DEPLOYMENT.md) et les [règles CI et releases](RELEASES.md).
