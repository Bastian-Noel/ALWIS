# Publication automatique du wiki

[Ouvrir le wiki](https://github.com/Bastian-Noel/ALWIS/wiki) · [Voir les publications](https://github.com/Bastian-Noel/ALWIS/actions/workflows/publish-wiki.yml)

## Modifier la documentation

1. Modifiez les fichiers Markdown du dépôt et les captures dans `docs/images/`.
2. Poussez sur **main**.
3. L’action **Documentation - GitHub Wiki** actualise les pages, les images, la barre latérale et le pied de page.

**Le dépôt est la source.** Une modification directe d’une page générée du wiki sera remplacée à la prochaine publication. Les pages personnelles non générées sont conservées.

## Configuration GitHub — une seule fois

| Où | Action |
|---|---|
| **Settings → General → Features** | Activez **Wikis**, puis créez une première page dans le wiki. |
| **Settings → Secrets and variables → Actions** | Ajoutez le secret **WIKI_TOKEN** : un jeton personnel classique d’un compte autorisé à écrire dans le dépôt, avec le droit `public_repo` (`repo` pour un dépôt privé). |
| **Actions → Documentation - GitHub Wiki** | Cliquez sur **Run workflow** pour publier immédiatement. |

Le jeton automatique `GITHUB_TOKEN` ne permet pas cette publication dans le dépôt Git séparé du wiki. Ne placez jamais le jeton dans un fichier ou une discussion.

## Vérifier avant publication

```sh
python3 -m unittest discover -s tests/wiki -v
python3 scripts/build-wiki.py --output build-work/wiki-preview
```

Chaque exécution conserve aussi un aperçu téléchargeable dans l’artefact **github-wiki**, même si la publication échoue.

- **Lien local introuvable** : corrigez le chemin indiqué dans le Markdown source.
- **Wiki inaccessible** : vérifiez son initialisation et les droits du jeton.
- **Fichier non géré déjà présent** : renommez la page personnelle en conflit ; elle n’est pas écrasée.

Les pages publiées sont répertoriées dans `scripts/build-wiki.py`. Ajoutez-y les nouveaux guides pour les publier et les rendre accessibles dans la navigation.
