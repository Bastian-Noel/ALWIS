# Versionnement ALWIS

Le projet est en **bêta de la version 1**. La version affichée est « ALWIS 2026.11 · Beta 1 ».

## Format officiel

Le numéro dans `package.json`, le ZIP et les images Docker est **`YYYY.MM.PATCH-STAGE.N`**.

| Élément | Exemple | Rôle |
| --- | --- | --- |
| Année et mois | `2026.11` | Période de publication |
| Révision | `.0` | Incrément par version publiée dans le même mois |
| Phase | `-alpha.1` | Fonctionnalités encore incomplètes |
| Phase | `-beta.1` | Parcours principal fonctionnel, validation en cours |
| Phase | `-rc.1` | Candidate à une version stable, gel des fonctionnalités |
| Stable | `2026.11.0` | Version validée et distribuable |

Les tags GitHub ajoutent `v` : **`v2026.11.0-beta.1`**, `v2026.11.0-rc.1`, `v2026.11.0`.

Ce format reste compatible avec les versions SemVer à trois éléments pour les outils npm et GHCR. L'année/mois n'implique pas un lancement chaque mois. **Une mise à jour dans Git ne crée pas à elle seule une release.**

## Conditions de publication

- Alpha : expérimentation ; aucun besoin de distribuer un binaire non conforme.
- Beta : parité fonctionnelle et tests suivis ; les licences et sources correspondantes restent obligatoires pour distribuer.
- RC : tests navigateur et multiutilisateur complets, sources vérifiées, aucun blocage de licence ni de sécurité.
- Stable : RC validée et publication FTP / GHCR explicitement autorisée.

Les versions historiques `v0.3.0-preview.*` restent inchangées pour conserver les références.
Aucun tag nouveau ne doit être créé avant que le binaire, les vérifications et la documentation de cette version soient finalisés.
