# Publication et nettoyage vérifiés — 1 novembre 2026

Le build statique de la source `19b6ee0dbec4bd9395cdf5113701aed281f62c43` a passé la [CI](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41337154626) et la [publication FTP](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41337170552). Le transfert FTP vers la racine est réussi ; le secret est correctement disponible dans GitHub Actions.

La [préversion v0.2.0-preview.2](https://github.com/Bastian-Noel/WASMWebServer/releases/tag/v0.2.0-preview.2) distribue la refonte IDE : accueil des projets, arborescence à droite, complétion contextuelle, navigation bases/tables, formulaires de structure, diagramme de relations, sessions visuelles et archives ZIP fichiers + bases. Voir le [guide IDE](ESPACE-IDE.md).

| Contrôle | Résultat |
|---|---|
| Empreintes du moteur natif et correspondance aux sources C | Réussies |
| Build des éditeurs et paquet statique | Réussis |
| Tests Node | 44 réussis |
| Parcours IDE réels Chromium / Firefox | 17 contrôles réussis dans chacun |
| Atelier existant et paquet distribué sur les deux navigateurs | Réussis |
| Journal, vrais diagnostics PHP/SQL et mises en page Chromium | Réussis |
| Audit axe Chromium | 11 états, aucune violation détectée |
| Tests natifs MySQLi du workflow | Réussis, restrictions documentées conservées |
| Transfert FTP | Réussi |
| Préversion et trois pièces jointes | Publiées |

Le ZIP du site fait 23 109 017 octets, SHA-256 `dfe5f36972a706f1416f1c70cce19e24dd8d34b362a7aa612bdb7895e84b3b61`. Les reçus et SHA256SUMS l’accompagnent. La préversion intermédiaire a été retirée après réussite du build corrigé ; v0.1.0 reste la précédente distribution stable.

L’URL publique n’est pas configurée : HTTPS et les en-têtes du véritable domaine restent à vérifier. Un transfert FTP réussi ne constitue pas ce contrôle navigateur en ligne. Le moteur natif n’a pas été recompilé pour cette refonte ; aucune nouvelle réduction de RAM totale n’est déduite des changements d’interface.

## Nettoyage

- Deux workflows actifs : CI et publication FTP manuelle. Les trois anciennes recettes amont sont archivées hors des workflows actifs pour préserver la possibilité de reconstruction.
- Six caches amont obsolètes supprimés : 405 373 660 octets. Les caches actuels sont conservés.
- README et index recentrés, rapports historiques identifiés, sorties générées et checkout du moteur exclus des sources Git.
- L'archive `sources-2026-10-31` est conservée et classée séparément comme préversion d'archive, explicitement sans être une version du studio. Ses sources épinglées et licences sont nécessaires à la reproduction.

Il n'existait pas d'ancienne release applicative inutile à supprimer. Les reçus, licences et preuves historiques utiles restent conservés. Aucun historique Git n'a été réécrit.

Voir le [guide FTP](FTP-DEPLOYMENT.md) et les [règles CI et releases](RELEASES.md).
