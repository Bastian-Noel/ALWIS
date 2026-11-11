# Installer ou ouvrir ALWIS

Le moyen le plus rapide est d’[ouvrir le studio en ligne](https://studio.mmi.place/) puis de choisir l’exemple Campus. PHP et MariaDB s’exécutent dans le navigateur ; leur installation sur le PC n’est pas nécessaire.

![L’accueil du studio.](images/alwis-start.png)

## Installation locale

1. Téléchargez le **paquet statique ZIP** de la [version 2026.11 Beta 1](https://github.com/Bastian-Noel/ALWIS/releases/tag/v2026.11.0-beta.1), plutôt que l’archive GitHub du seul code source.
2. Décompressez-le dans un dossier.
3. Avec [Node.js 20 ou supérieur](https://nodejs.org/) installé, ouvrez un terminal dans ce dossier :

```sh
node serve.mjs
```

4. Ouvrez **http://127.0.0.1:8080** dans Chromium ou Firefox.
5. Choisissez le Campus et suivez les [premiers pas](README.md).

N’ouvrez pas directement le fichier HTML via `file://` : le studio a besoin de son serveur HTTP et de ses ressources. Le ZIP publié comprend le runtime construit ; cloner les sources est un autre parcours, destiné au [développement](../CONTRIBUTING.md).

## Héberger votre instance

L’image `ghcr.io/bastian-noel/alwis-server:2026.11.0-beta.1` est publiée pour **linux/amd64 et linux/arm64**. Elle sert l’interface et les services de collaboration ; les projets et leur moteur PHP/SQL restent dans le navigateur hôte.

Suivez le [guide Docker](server-deployment.md) pour l’installation, puis la [référence Compose et publication](deployment.md). Pour l’aperçu HTTP des invités, prévoyez une origine HTTPS dédiée en plus du domaine du studio.

## Conserver ses projets

Un serveur local n’est pas une sauvegarde de vos projets. Ils dépendent du stockage du navigateur et de l’origine utilisée. Enregistrez puis exportez régulièrement un ZIP. Un mode hors ligne ne doit pas être supposé complet sans vérifier les ressources nécessaires à votre projet.

La bêta est publiée avec une exception de licence documentée ; consultez [l’état de publication](../provenance/release-licensing-status.json) avant redistribution. [Compatibilité](compatibility.md) · [Sauvegardes](saving-projects.md).
