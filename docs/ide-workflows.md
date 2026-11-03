# Code, sauvegardes et dossier du PC

[← Guide illustré](README.md)

## Se déplacer au clavier

**Maintenez Alt pendant 400 ms** pour afficher les raccourcis sur les commandes. Relâchez Alt pour les masquer. Un appui bref n’affiche rien.

| Touches | Action |
|---|---|
| **Tab / Maj + Tab** | Passer à la commande suivante / précédente |
| **Flèches** | Parcourir les onglets, menus et listes de fichiers ou de bases |
| **Entrée / Espace** | Activer un bouton ou un onglet |
| **Suppr**, sur un onglet de fichier | Fermer ce fichier ; un brouillon demande confirmation |
| **Échap** | Fermer un menu ou un dialogue |
| **Alt + 1 / 2 / 3 / 4** | Code / Données / Schéma / Sessions |
| **Ctrl + S** ou **Alt + S** | Enregistrer les fichiers et le projet |
| **Alt + R** | Afficher ou masquer l’aperçu |
| **Alt + J** | Ouvrir ou fermer le panneau Serveur |
| **Alt + K** | Rechercher une action |
| **Alt + F / E / P** | Formater / Emmet / Problèmes |
| **Alt + N** | Nouveau fichier |

**Pour quitter l’éditeur : Échap, puis Tab.** Tab seul garde son rôle d’indentation ou de complétion.

Dans les onglets, les flèches déplacent le focus ; **Entrée** ouvre l’onglet choisi. La poignée du panneau Serveur se règle avec **Haut / Bas**, **Début / Fin**.

Les raccourcis globaux restent inactifs dans les dialogues. **AltGr** garde son rôle de saisie de caractères.

## Écrire plus vite

| Vous voulez… | Faites… |
|---|---|
| Une page HTML de départ | Dans un fichier HTML vide, tapez `!`, puis **Entrée** |
| Une liste de trois éléments | Tapez `ul>li*3`, puis **Tab** |
| Des suggestions | **Ctrl + Espace** |
| Accepter une suggestion | **Tab** |
| Ranger le fichier | **Formater** ou **Alt + Maj + F** |
| Chercher dans le fichier | **Ctrl + F** |
| Comprendre un soulignement | **Problèmes** |

> [!TIP]
> La page créée avec `!` utilise `lang="fr"`. En SQL, les suggestions de mots-clés sont en majuscules : `SELECT`, `FROM`…

**Exemple Emmet** — `ul>li*3` devient :

```html
<ul>
  <li></li>
  <li></li>
  <li></li>
</ul>
```

### Une erreur dans le code ?

1. Ouvrez **Problèmes**.
2. Lisez le message de la ligne signalée.
3. Appliquez une correction si elle est proposée.

Certaines erreurs courantes, comme un `;` manquant en PHP, peuvent être corrigées. Toutes les erreurs n’ont pas de correction automatique.

## Changer de projet et créer des fichiers

Le nom du **projet ouvert** reste affiché en haut. Cliquez dessus pour ouvrir un projet récent ou revenir à **Tous les projets**. Si des modifications sont en attente, ALWIS propose de les enregistrer avant de quitter le projet.

Dans l’explorateur, cliquez sur **Nouveau fichier** ou **Nouveau dossier**, puis saisissez le nom directement dans l’arborescence. **Entrée** crée l’élément ; **Échap** annule. Un chemin comme `pages/contact.php` crée aussi les dossiers nécessaires. Un nom déjà utilisé est refusé.

Les outils secondaires et le réglage d’indentation se trouvent dans **…** au-dessus de l’éditeur. Les icônes ont un nom accessible et une indication au survol.

## Enregistrer le projet

| Action | Ce qui est conservé | Où ? |
|---|---|---|
| **Enregistrer**, **Ctrl + S** ou **Alt + S** | Tous les brouillons, fichiers et bases | Dans ce navigateur |
| **Exporter ZIP** | Les fichiers et bases utilisateur | Dans un fichier téléchargé |

**Conseil :** sauvegardez pendant le travail ; exportez un ZIP avant de changer de PC.

## Rechercher dans les données et relier des tables

Dans **Données**, cherchez une table dans le volet de gauche. La recherche au-dessus de la grille porte sur toutes les colonnes et toutes les lignes de la table, y compris les pages suivantes. Vous pouvez la combiner avec **Filtrer par colonne**.

Pour créer une relation, ouvrez **Schéma → Relier des tables** ou **Données → Structure → Relation**. Choisissez les deux tables, puis la clé référencée et les colonnes correspondantes. Les clés composées sont proposées ensemble. Les comportements à la suppression et à la modification restent dans les options ; la requête SQL est consultable à la demande.

## Importer un ZIP

1. Depuis l’accueil, cliquez sur **Importer un ZIP**.
2. Choisissez l’archive : ALWIS crée un projet à partir de son nom.
3. Sauvegardez le projet après l’import.

Si ce nom existe déjà, ALWIS choisit un nom distinct. Votre projet existant est conservé.

L’import se fait depuis l’accueil, pour créer un projet distinct. Pour y revenir, ouvrez le sélecteur du projet puis **Tous les projets**.

> [!NOTE]
> Un fichier du même nom ou une base déjà remplie peut bloquer l’import. ALWIS refuse de les écraser silencieusement.

## Ouvrir un dossier du PC

**Disponible avec Chrome ou Edge sur ordinateur.**

1. Depuis l’accueil, cliquez sur **Ouvrir un dossier du PC…**.
2. Choisissez le dossier et autorisez l’accès.
3. Modifiez un fichier, puis faites **Ctrl + S**.

La mention **Projet ouvert · dossier PC**, au-dessus du nom du dossier, indique que les fichiers enregistrés sont aussi écrits sur le PC.

![Le bouton Ouvrir un dossier du PC se trouve sur l’accueil.](images/alwis-start.png)

| Modification | Écrite sur le PC ? |
|---|---|
| Fichier texte enregistré depuis l’éditeur | Oui |
| Base SQL | Non |
| Suppression ou renommage | Non |
| Fichier ajouté par import ZIP | Non |

> [!IMPORTANT]
> Rouvrez le dossier à chaque session. Si un autre logiciel a modifié un fichier, ALWIS refuse de l’écraser et garde votre brouillon.

<details>
<summary>Limites du dossier local</summary>

- 64 Mio au total ; 16 Mio par fichier.
- 1 024 fichiers ; 12 niveaux de dossiers.
- Éléments cachés, `node_modules` et `vendor` ignorés.
- Les gros fichiers peuvent être importés sans être éditables.
- Sans accès aux dossiers dans votre navigateur, utilisez un ZIP.

</details>

[← Retour au guide](README.md) · [Compatibilité](compatibility.md)
