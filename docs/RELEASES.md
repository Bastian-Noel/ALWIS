# CI et versions

Deux workflows sont actifs :

| Workflow | Déclenchement | Rôle |
|---|---|---|
| CI - validated studio | Push main, pull request, manuel | Build et validations partagées ; les changements Markdown seuls sont ignorés |
| Publish FTP - validated studio | Manuel uniquement | Même validation, paquet statique, transfert FTP et version optionnelle |

Les contrôles sont définis une seule fois dans `.github/actions/validated-studio/action.yml`. Les actions externes sont épinglées par commit. Les anciennes recettes de témoins et d'archivage des sources sont conservées dans `.github/workflow-templates/`, sans exécution automatique. Elles ne sont pas des contrôles quotidiens du studio custom.

## Publier une version

Dans **Publish FTP - validated studio → Run workflow**, choisir `operation=publish`. Laisser `version` vide pour un simple déploiement ou utiliser un nom comme `v0.2.0-preview.1` pour créer une release après réussite du transfert.

Pour versionner un build déjà envoyé, choisir `operation=release`, renseigner `version` et l'identifiant de l'exécution FTP dans `validated_run`. Le script exige un job FTP réussi sur main, vérifie la révision et toutes les empreintes du manifeste, puis reprend le paquet exact sans le reconstruire. Les reçus CI disponibles pour cette révision accompagnent le ZIP, avec SHA256SUMS.

Une version publiée ne peut pas être remplacée par ce script ; choisir un nouveau numéro. Le script peut reprendre un brouillon correspondant à la même source. Les versions stables deviennent la dernière release ; les suffixes alpha/beta/rc/preview restent des préversions. Une version stable nommée reste soumise aux limites fonctionnelles documentées du prototype.

La création initiale de release avec le jeton du runner a reçu HTTP 403 dans ce dépôt, malgré `contents: write`. Préparer le tag seul n'a pas suffi. Pour v0.1.0, le brouillon a été créé avec l'intégration GitHub autorisée, sur **la révision validée**, puis le workflow a réussi l'ajout des trois pièces jointes et la publication. Si ce refus revient, un mainteneur prépare le brouillon avec le même tag et la même révision, puis relance `operation=release`. Ne pas déplacer un tag publié vers une autre source.

## Conservation

Les paquets Actions expirent après 14 jours et les sauvegardes FTP après 7 jours. Les pièces jointes d'une release constituent la distribution durable. Les caches accélèrent les jobs sans constituer une preuve de validation. Les six anciens caches amont supprimés représentaient 405 373 660 octets.

L'archive `sources-2026-10-31` est une archive de provenance séparée, identifiée comme telle et exclue de la dernière release applicative. La supprimer casserait la restauration des sources. Les reçus historiques et les licences sont conservés ; l'historique Git n'est pas réécrit.

Première version publiée : [v0.1.0](https://github.com/Bastian-Noel/WASMWebServer/releases/tag/v0.1.0), [exécution de versionnement réussie](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41334230705).
