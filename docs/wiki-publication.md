# Publication automatique du wiki

[Ouvrir le wiki](https://github.com/Bastian-Noel/ALWIS/wiki) · [Voir les publications](https://github.com/Bastian-Noel/ALWIS/actions/workflows/publish-wiki.yml)

## Modifier la documentation

1. Modifiez les fichiers Markdown du dépôt et les captures dans `docs/images/`.
2. Poussez sur **main**.
3. L’action **05 - Documentation - Wiki** actualise les pages, les images, la barre latérale et le pied de page.

**Le dépôt est la source.** Une modification directe d’une page générée du wiki sera remplacée à la prochaine publication. Les pages personnelles non générées sont conservées.

## Configuration GitHub — une seule fois

| Où | Action |
|---|---|
| **Settings → General → Features** | Activez **Wikis**, puis créez une première page dans le wiki. |
| **Settings → Secrets and variables → Actions** | Ajoutez le secret **WIKI_TOKEN** : un jeton personnel classique d’un compte autorisé à écrire dans le dépôt, avec le droit `public_repo` (`repo` pour un dépôt privé). |
| **Actions → 05 - Documentation - Wiki** | Cliquez sur **Run workflow** pour publier immédiatement. |

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

## Organiser les parcours et les illustrations

`docs/wiki-home.md` contient l’accueil. `scripts/build-wiki.py` définit les pages publiées, leurs adresses et la barre latérale : Découvrir, Pratiquer, Comprendre les données, Technique et Déployer. Un nouveau guide doit être accessible depuis ce parcours, pas seulement exister dans un dossier.

Les liens relatifs sont vérifiés puis convertis vers le wiki. Les images PNG et les SVG liés sont copiés dans ses assets ; les autres sources restent liées à une révision Git immuable. Le générateur préserve les pages personnelles, refuse les collisions et ne retire que ses anciens fichiers gérés.

Pour les captures et les planches, consultez [la méthode d’illustration](illustrations.md). Gardez une explication textuelle près de chaque image : elle doit rester compréhensible sans devoir déchiffrer une capture réduite.
