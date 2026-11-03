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
| **Alt + S** | Sauvegarder le projet |
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

## Enregistrer ou sauvegarder ?

| Action | Ce qui est conservé | Où ? |
|---|---|---|
| **Ctrl + S** | Le fichier actif | Dans le projet en cours d’exécution |
| **Sauvegarder le projet** | Tous les brouillons, fichiers et bases | Dans ce navigateur |
| **Exporter ZIP** | Les fichiers et bases utilisateur | Dans un fichier téléchargé |

**Conseil :** sauvegardez pendant le travail ; exportez un ZIP avant de changer de PC.

## Importer un ZIP

1. Depuis l’accueil, cliquez sur **Importer un ZIP**.
2. Choisissez l’archive : ALWIS crée un projet à partir de son nom.
3. Sauvegardez le projet après l’import.

Si ce nom existe déjà, ALWIS choisit un nom distinct. Votre projet existant est conservé.

Dans un projet ouvert, l’import reste accessible dans l’en-tête ou le menu du projet.

> [!NOTE]
> Un fichier du même nom ou une base déjà remplie peut bloquer l’import. ALWIS refuse de les écraser silencieusement.

## Ouvrir un dossier du PC

**Disponible avec Chrome ou Edge sur ordinateur.**

1. Depuis l’accueil, cliquez sur **Ouvrir un dossier du PC…**.
2. Choisissez le dossier et autorisez l’accès.
3. Modifiez un fichier, puis faites **Ctrl + S**.

Le nom **PC : votre dossier** indique que les fichiers enregistrés sont aussi écrits sur le PC.

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
