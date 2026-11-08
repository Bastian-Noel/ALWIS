<div align="center">

# ALWIS

**Écrivez du PHP. Testez votre site. Explorez vos données.**

Tout dans le navigateur, avec un éditeur et une base MariaDB.

[![Validation](https://github.com/Bastian-Noel/ALWIS/actions/workflows/check.yml/badge.svg)](https://github.com/Bastian-Noel/ALWIS/actions/workflows/check.yml)
[![Préversion](https://img.shields.io/badge/statut-pr%C3%A9version-9a6700)](https://github.com/Bastian-Noel/ALWIS/releases)

[Wiki](https://github.com/Bastian-Noel/ALWIS/wiki) · [Premiers pas](https://github.com/Bastian-Noel/ALWIS/wiki/Premiers-pas) · [Guide illustré](https://github.com/Bastian-Noel/ALWIS/wiki/Premiers-pas) · [Exemple Campus](https://github.com/Bastian-Noel/ALWIS/wiki/Campus) · [Image Docker](https://github.com/Bastian-Noel/ALWIS/wiki/Serveur-Docker)

</div>

![ALWIS : éditeur de code et aperçu réel du Campus des Tilleuls, prêts à tester dans le navigateur.](apps/studio/social-card.png)

## Démarrer

1. Téléchargez le **paquet applicatif ZIP** depuis les [versions publiées](https://github.com/Bastian-Noel/ALWIS/releases).
2. Décompressez-le, puis ouvrez un terminal dans ce dossier.
3. Avec [Node.js 20 ou plus récent](https://nodejs.org/fr) installé, lancez :

   ```sh
   node serve.mjs
   ```

4. Ouvrez **http://127.0.0.1:8080**.
5. Nommez votre projet, choisissez **Exemple scolaire**, puis créez-le.

> [!TIP]
> Aucune installation de PHP ou de MariaDB n’est nécessaire.
> Le [guide illustré](https://github.com/Bastian-Noel/ALWIS/wiki/Premiers-pas) vous accompagne ensuite.

Pour héberger ALWIS sur votre propre serveur, choisissez la [distribution Docker](https://github.com/Bastian-Noel/ALWIS/wiki/Serveur-Docker). Elle est publiée après le build statique et a une page de configuration protégée.

## Où aller ?

| Vous voulez… | Ouvrez… |
|---|---|
| Écrire une page et voir le résultat | **Code → Aperçu** |
| Lire ou modifier une table | **Données** |
| Voir les liens entre les tables | **Schéma** |
| Tester avec plusieurs visiteurs | **Sessions** |
| Comprendre une erreur | **Serveur** |

## Garder votre travail

**Enregistrer** conserve votre travail dans ce navigateur.
**Exporter ZIP** crée une copie à garder sur votre ordinateur.

> [!IMPORTANT]
> Effacer les données du navigateur peut effacer vos projets. Gardez un ZIP des projets importants.

## Pour continuer

- [Écrire du code, sauvegarder et ouvrir un dossier du PC](https://github.com/Bastian-Noel/ALWIS/wiki/Editeur-et-sauvegardes)
- [Essayer le Campus avec plusieurs visiteurs](https://github.com/Bastian-Noel/ALWIS/wiki/Campus)
- [Navigateurs et limites](https://github.com/Bastian-Noel/ALWIS/wiki/Compatibilite)
- [Installer les sources et contribuer](https://github.com/Bastian-Noel/ALWIS/wiki/Contribuer)

<details>
<summary><strong>Documentation technique et licences</strong></summary>

[Architecture](https://github.com/Bastian-Noel/ALWIS/wiki/Architecture) · [Performance](https://github.com/Bastian-Noel/ALWIS/wiki/Performance) · [Hébergement](https://github.com/Bastian-Noel/ALWIS/wiki/Publication)

ALWIS utilise notamment PHP, MariaDB, CodeMirror, PHPantom, SuperHTML, TypeScript, SWC et Emmet.
Les licences et la provenance se vérifient dans [`provenance/`](provenance/), ainsi que dans les notices livrées avec chaque paquet.
Le [registre des licences](LICENSE.md), les [notices tierces](THIRD-PARTY-NOTICES.md), l’[audit](provenance/licensing-decision.md) et la [cartographie par composant](provenance/component-license-map.md) détaillent les licences et les limites d’une restriction non commerciale globale.

</details>
