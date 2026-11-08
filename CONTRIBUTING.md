# Développer ALWIS

[← Accueil](README.md) · [Architecture](docs/architecture.md) · [Hébergement](docs/deployment.md)

## 1. Préparer les outils

| Outil | Version / condition |
|---|---|
| Node.js | 24 ou plus récent, avec npm |
| Python | 3.12 ou plus récent |
| GitHub CLI (`gh`) | Connecté à un compte GitHub |

## 2. Lancer le projet

```sh
git clone https://github.com/Bastian-Noel/ALWIS.git
cd ALWIS
npm ci
python3 scripts/restore-deployment-engine.py
npm run editor:build
node scripts/serve-studio.mjs
```

Ouvrez **http://127.0.0.1:8080**.
La restauration télécharge le moteur épinglé : inutile de recompiler PHP et MariaDB pour modifier l’interface.

## 3. Vérifier une modification

```sh
npm test
node scripts/package-studio.mjs
node tests/browser/site-package.mjs
```

Ajoutez les parcours concernés :

| Changement | Test navigateur |
|---|---|
| Éditeur et complétion | `tests/browser/editor-intelligence.mjs` |
| Code, données, schéma, sessions | `tests/browser/alwis-workbench.mjs` |
| Dossier local et simplicité de l’interface | `tests/browser/ide-usability.mjs` |
| Accessibilité | `tests/browser/alwis-accessibility.mjs` |
| Clavier, focus et maintien d’Alt | `tests/browser/keyboard.mjs` |
| Accueil, projets récents et import ZIP | `tests/browser/launcher.mjs` |

Les tests navigateur nécessitent Playwright et ses navigateurs. La [CI](.github/workflows/check.yml) décrit leur installation.

## Repères

- Suivez les [règles du dépôt](AGENTS.md), notamment le travail sur `main`.
- Suivez le [registre de provenance](provenance/README.md) et consignez toute copie ou adaptation dans `provenance/reuse-ledger.csv`.
- Gardez les licences de chaque composant et vérifiez les notices dans chaque artefact distribué ; le `THIRD-PARTY.txt` de l'éditeur ne couvre pas automatiquement le moteur natif.
- Consultez [`LICENSE.md`](LICENSE.md), les [notices tierces](THIRD-PARTY-NOTICES.md), l'[audit des licences](provenance/licensing-decision.md) et la [cartographie par composant](provenance/component-license-map.md) avant toute redistribution. La publication reste bloquée tant que le statut de licence n'est pas `ready`.
- Ne versionnez pas `build-work/`, `sources/`, `upstream/` ou `node_modules/`.
- Une validation locale ne prouve pas qu’une version publiée contient la modification.

<details>
<summary>Modifier le moteur PHP / MariaDB</summary>

1. Suivez la [recette native](engine/native/build/README.md).
2. Recompilez et validez le moteur modifié.
3. Après le commit de ses sources, préparez la distribution :

   ```sh
   python3 scripts/manifest-native-build.py
   ```

Les fichiers et empreintes sont générés dans `build-work/native-distribution/`.
Les preuves de validation doivent correspondre au WASM exact. Ne changez pas les empreintes pour contourner une vérification.

</details>

## Publier la documentation

Le [wiki GitHub](https://github.com/Bastian-Noel/ALWIS/wiki) suit automatiquement les modifications sur `main` : [configuration et vérification](docs/wiki-publication.md).
