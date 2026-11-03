# Ce qui fonctionne et les limites

[← Guide illustré](README.md)

ALWIS est une **préversion**, conçue pour apprendre, faire des exercices et tester de petits sites.

## Navigateurs

| Navigateur | Utilisation |
|---|---|
| **Chrome / Chromium** | Parcours automatisés de l’éditeur, PHP et SQL |
| **Edge** | Accès au dossier du PC possible ; pas de validation dédiée complète |
| **Firefox** | Parcours automatisés prévus ; utilisez le ZIP pour les fichiers du PC |
| **Safari** | Pas de validation complète |

> [!NOTE]
> Les dernières modifications de l’IDE ont été vérifiées dans Chromium. Firefox n’était pas installé dans l’environnement de cette vérification.

## Dans un projet

| Vous pouvez… | À savoir |
|---|---|
| Exécuter du PHP et utiliser MariaDB | La compatibilité avec toutes les extensions PHP n’est pas garantie |
| Utiliser PDO et MySQLi | Certaines fonctions avancées ont des limites |
| Éditer PHP, HTML, JavaScript, CSS et JSON | Les corrections automatiques ne couvrent pas toutes les erreurs |
| Tester plusieurs visiteurs | Les fichiers et la base restent communs |
| Sauvegarder dans le navigateur | Une suppression des données du navigateur peut effacer le projet |
| Exporter fichiers et bases en ZIP | Les sessions des visiteurs sont exclues |
| Modifier un dossier du PC | Chrome/Edge ; pas de synchronisation complète |

[Comprendre les sauvegardes et les dossiers →](ide-workflows.md)

## Si le projet est volumineux

- L’édition de texte est limitée à **1 Mio par fichier**.
- L’analyse du code est limitée à **256 K caractères par document**.
- Le schéma affiche au maximum **50 tables et 2 000 colonnes**.
- La grille affiche **100 lignes par page** ; son CSV exporte le résultat courant.

La RAM dépend du navigateur, du projet et des outils ouverts. La mémoire affichée pour le moteur n’est pas toute la mémoire du navigateur.

[Lire les mesures de performance →](performance.md)

<details>
<summary>Références techniques et preuves</summary>

- [Extensions PHP et tests](../engine/fusion/PHP-ESSENTIALS-RECEIPT.md)
- [Fonctions MySQLi et limites](../engine/fusion/MYSQLI-106-RECEIPT.md)
- [Fonctionnement de l’éditeur](../apps/studio/editor/README.md)
- [Notes historiques de compatibilité](reference-compatibility.md)
- [Notes techniques historiques du studio](reference-studio.md)

Les tests automatisés ne remplacent pas une validation manuelle complète avec un lecteur d’écran.

</details>
