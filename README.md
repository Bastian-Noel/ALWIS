<div align="center">

# ALWIS

**Atelier Local Web avec IDE et SQL**

Votre projet PHP, son éditeur et sa base de données, réunis dans le navigateur.

[![Validation](https://github.com/Bastian-Noel/ALWIS/actions/workflows/check.yml/badge.svg)](https://github.com/Bastian-Noel/ALWIS/actions/workflows/check.yml)
[![Préversion](https://img.shields.io/badge/statut-pr%C3%A9version-9a6700)](https://github.com/Bastian-Noel/ALWIS/releases)
[![PHP](https://img.shields.io/badge/PHP-8.4.27-5969a7)](docs/compatibility.md)
[![Navigateurs](https://img.shields.io/badge/test%C3%A9-Chromium%20%26%20Firefox-276ac4)](docs/compatibility.md)

[Premiers pas](#essayer-alwis) · [Guide de l’atelier](docs/README.md) · [Contribuer](CONTRIBUTING.md)

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/alwis-code-dark.png">
  <img src="docs/images/alwis-code-light.png" alt="ALWIS : code PHP dans CodeMirror, explorateur de fichiers et aperçu du site exécuté dans le navigateur, côte à côte." width="1500">
</picture>

## Un endroit pour apprendre et construire

Vous écrivez une page PHP, vous l’ouvrez dans l’aperçu et vous retrouvez ses données dans le même atelier. PHP et MariaDB tournent sur votre appareil, dans le navigateur : aucun serveur PHP distant ni installation locale de base de données n’est nécessaire pour exécuter le projet.

ALWIS convient aux exercices, aux petits sites et aux prototypes. Il permet aussi d’ouvrir plusieurs clients avec des sessions différentes pour vérifier une connexion, un formulaire ou une base partagée.

| Dans l’atelier | Ce que vous pouvez faire |
|---|---|
| **Code** | Parcourir les fichiers, écrire avec la coloration, la complétion PHP/JS, les snippets, Emmet et l’aide aux paramètres. |
| **Aperçu** | Voir le site à côté du code, comparer deux sessions ou ouvrir une fenêtre cliente. |
| **Données** | Consulter et modifier les lignes, créer des tables, régler les colonnes et exécuter du SQL. |
| **Schéma** | Visualiser les clés et relations, déplacer les tables et créer des liens par glisser-déposer ou au clavier. |
| **Projets** | Garder ses brouillons, sauvegarder dans ce navigateur et exporter fichiers et bases dans un ZIP. |
| **Serveur** | Comprendre une erreur, lire les requêtes par session et consulter les ressources du moteur. |

## La base de données se voit aussi

Les types, clés, valeurs nulles et relations ont leurs repères visuels. Les formulaires présentent le SQL avant application. Les modifications de colonnes conservent les attributs existants ; les grands nombres, décimaux et binaires restent traités sans conversion approximative.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/alwis-schema-dark.png">
  <img src="docs/images/alwis-schema-light.png" alt="Schéma réel MariaDB dans ALWIS : tables classes, élèves et notes avec clés primaires, clés étrangères et cardinalités." width="1500" loading="lazy">
</picture>

<details>
<summary><strong>Voir la grille de données</strong></summary>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/alwis-data-dark.png">
  <img src="docs/images/alwis-data-light.png" alt="Grille MariaDB d’ALWIS avec ajout rapide, valeurs NULL, types et clés colorés." width="1500" loading="lazy">
</picture>

</details>

## Essayer ALWIS

> [!NOTE]
> La nouvelle interface ALWIS est disponible sur `main`. Les ZIP historiques `v0.1.0` et `v0.2.0-preview.2` conservent l’ancienne interface : leurs captures et validations ne décrivent pas cette version.

Pour démarrer depuis les sources, prévoyez **Node 24+, Python 3.12+ et GitHub CLI authentifié** pour télécharger le moteur épinglé :

```sh
git clone https://github.com/Bastian-Noel/ALWIS.git
cd ALWIS
npm ci
python3 scripts/restore-deployment-engine.py
npm run editor:build
node scripts/serve-studio.mjs
```

Ouvrez **http://127.0.0.1:8080**, donnez un nom au projet, puis choisissez l’exemple scolaire. Le moteur validé se télécharge sans recompiler PHP ou MariaDB.

Un paquet statique se prépare avec `node scripts/package-studio.mjs`. Une fois distribué, ce paquet se lance avec `node serve.mjs` et **Node 20+**. Pour l’hébergement HTTPS et les en-têtes nécessaires : [guide de publication](docs/deployment.md).

## Vos fichiers, vos sauvegardes

**Enregistrer** applique le code au projet exécuté. **Sauvegarder** conserve le projet dans le stockage de ce navigateur. **Exporter en ZIP** crée une sauvegarde transportable avec les fichiers et les bases utilisateur ; les sessions clientes en sont exclues.

> [!IMPORTANT]
> Le stockage du navigateur peut être effacé. Exportez les projets que vous souhaitez conserver. ALWIS reste une préversion : la compatibilité PHP/PDO/MySQLi n’est pas exhaustive, et la mémoire totale dépend du navigateur et du projet.

Les captures ci-dessus proviennent de l’interface intégrée, avec du PHP et du SQL réellement exécutés. La validation automatisée couvre Chromium et Firefox ; Safari et les lecteurs d’écran ne bénéficient pas d’une validation manuelle complète.

## Aller plus loin

[Guide utilisateur](docs/README.md) · [Compatibilité et limites](docs/compatibility.md) · [Architecture](docs/architecture.md) · [Mesures de performance](docs/performance.md) · [Contribution](CONTRIBUTING.md)

<details>
<summary><strong>Composants et licences</strong></summary>

ALWIS utilise notamment PHP, MariaDB, CodeMirror 6, PHPantom, SuperHTML, TypeScript, SWC et Emmet. Les sources épinglées et notices sont conservées dans `provenance/`, et les notices des éditeurs sont regroupées dans `THIRD-PARTY.txt` du paquet.

Aucune licence globale n’a été choisie pour le projet. Consultez les notices avant redistribution. La release technique du moteur et l’archive des sources amont sont distinctes des versions applicatives.

</details>
