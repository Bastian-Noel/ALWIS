# Installer ALWIS

[Premiers pas](README.md) · [Déployer le serveur](server-deployment.md)

ALWIS exécute PHP et MariaDB dans le navigateur. **Vous n'avez pas besoin d'installer PHP ou MySQL sur votre ordinateur.**

## Installation locale

1. Téléchargez un ZIP publié depuis les [versions GitHub](https://github.com/Bastian-Noel/ALWIS/releases).
2. Décompressez le ZIP dans un dossier de votre choix.
3. Avec [Node.js 20+](https://nodejs.org/) installé, ouvrez un terminal dans le dossier et lancez :

   ```sh
   node serve.mjs
   ```

4. Ouvrez **http://127.0.0.1:8080** dans Chromium ou Firefox.
5. Créez un projet ou essayez **l'exemple Campus**.

> [!IMPORTANT]
> Les nouvelles distributions sont actuellement suspendues pendant la mise en conformité du runtime natif. Les anciens ZIP servent de référence technique et ne prouvent pas une conformité de redistribution.

## Héberger ALWIS

Pour permettre le partage entre plusieurs navigateurs, il faut l'**édition serveur**. Elle fournit la page web et le service de collaboration, **pas** la base de données de vos projets.

Consultez la [configuration Docker](server-deployment.md), puis la [description des services](deployment.md).

## Questions fréquentes

| Question | Réponse |
| --- | --- |
| Faut-il installer PHP ou MariaDB ? | Non, ils s'exécutent en WebAssembly. |
| Où sont les fichiers ? | Dans le stockage local du navigateur. |
| Puis-je travailler sans Internet ? | Certaines fonctionnalités peuvent fonctionner après le chargement initial ; vérifiez la disponibilité des ressources. |
| Comment conserver une copie ? | Utilisez **Exporter ZIP** régulièrement. |
| Puis-je inviter quelqu'un ? | Oui sur l'édition serveur, avec les limites précisées dans [Collaboration](collaboration.md). |

Pour apprendre à utiliser l'éditeur, poursuivez avec les [premiers pas illustrés](README.md).
