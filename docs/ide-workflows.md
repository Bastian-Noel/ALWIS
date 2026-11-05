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

Dans la ligne d’ajout, une valeur entière invalide est signalée directement sous le champ, qui reçoit le focus. Les valeurs saisies restent en place pour correction. Les erreurs de longueur et les contraintes SQL reconnues sont affichées dans la grille ; une correction efface le message du champ.

La sélection des lignes est réinitialisée après un tri, un changement de page ou un rechargement des données : vérifiez votre sélection avant une suppression. Les flèches déplacent le focus dans la grille en conservant la ligne de saisie en cours.

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

Le dossier et le ZIP passent par le même écran de préparation **avant tout chargement de contenu et avant création du projet**. Les chemins peuvent être filtrés et cochés, avec un budget recalculé : 64 Mio, 1 024 fichiers retenus, 16 Mio par fichier et 12 niveaux. Les fichiers trop lourds restent visibles mais ne sont pas chargés. Un dossier de 75 Mio peut ainsi s’ouvrir après exclusion d’un fichier de 15 Mio.

`node_modules`, `vendor` (Composer), les environnements Python, caches, fichiers cachés et archives sont proposés à l’exclusion. `composer.json` et `composer.lock` restent sélectionnés. **Attention : vendor/autoload.php peut être nécessaire à PHP** ; les dépendances peuvent être incluses si elles tiennent dans les limites. Pour un dossier local, les arbres recommandés restent non parcourus jusqu’à l’inclusion explicite, puis un nouvel écran présente leurs fichiers.

**Adapter aux limites** propose de retirer d’abord les éléments optionnels et plus volumineux, en préservant autant que possible les points d’entrée et manifestes. Ce tri reste à vérifier : retirer une dépendance ou une ressource peut empêcher le projet de fonctionner. La sélection reste modifiable avant de confirmer. Annuler ne crée aucun projet. Les fichiers exclus restent sur le PC et ne figurent pas dans l’export du projet.

Le ZIP est inspecté par son répertoire central ; seuls les fichiers choisis sont décompressés et contrôlés par CRC. Une archive de plus de 65 Mio peut donc être ouverte si les fichiers retenus respectent le budget. ZIP64 et multi-volumes restent non pris en charge, l’analyse est limitée à 50 000 entrées et 16 Mio de métadonnées. Les liens symboliques, fichiers chiffrés et compressions non prises en charge sont signalés comme non importables. Les chemins dangereux et archives corrompues sont refusés. Les sauvegardes SQL internes d’ALWIS sont conservées ensemble, jamais retirées par le tri automatique.

Les fichiers retenus entre 6 et 16 Mio sont transmis au moteur en blocs de 2 Mio, sans élargir les budgets RPC. Un fichier est rendu visible uniquement après réception complète ; un échec ou abandon nettoie le fichier temporaire. Le moteur refuse l’enregistrement d’un checkpoint pendant cette réception.

</details>

[← Retour au guide](README.md) · [Compatibilité](compatibility.md)

## Édition, recherche et diagnostics

**Ctrl F** ouvre une recherche fixe en haut à droite du code. Le chevron déplie le remplacement ; les flèches parcourent les résultats. **Aa**, **ab** et **.*** activent respectivement la casse, le mot entier et les expressions régulières. Chaque bouton possède une explication au survol et un nom accessible.

Les panneaux de navigation affichent le fichier, la ligne et la colonne. Leur bouton de fermeture se trouve en haut à droite et rend le focus à l’éditeur.

Le clic droit dans le code propose les actions adaptées au langage : définition, références et renommage de symbole en PHP/JavaScript, Emmet dans le HTML/CSS. Le menu des fichiers conserve les opérations sur le fichier et les réglages. La molette au-dessus des onglets passe au fichier précédent ou suivant.

Modifier le nom d’une balise HTML ouvrante met à jour sa fermeture correspondante, également dans les modèles PHP. **! puis Entrée** crée une page française avec la même indentation que le formateur. Le formatage des fichiers PHP, PHTML et INC traite séparément le PHP et le HTML : les expressions courtes restent compactes dans les attributs et les boucles indentent leur contenu HTML. Les chaînes PHP multilignes et le contenu des zones préformatées sont conservés. Si la structure ne peut pas être restaurée sans ambiguïté, la commande affiche une erreur et conserve le document original. Les diagnostics indiquent la ligne ; les points-virgules PHP manquants après un appel et les erreurs de syntaxe CSS sont signalés.

Un fichier **.md** s’affiche avec le bouton **Aperçu**. Cet aperçu léger gère titres, paragraphes, listes, liens HTTP(S), citations et blocs de code. Il n’exécute pas le HTML ni les scripts et ne charge pas d’images distantes.

## Ajouter une colonne depuis le schéma

Sélectionnez une table puis **Ajouter une colonne**. Le formulaire regroupe le nom et le type, les valeurs et contraintes, puis les options avancées (position, commentaire, jeu de caractères, collation et mise à jour automatique). La requête SQL reste consultable. La table du schéma est actualisée après validation.

## Dossiers du PC et gestion des projets

**Enregistrer** écrit les fichiers modifiés dans le dossier lié et conserve les bases SQL, les onglets, la requête et les positions du schéma dans **.alwis**. Sélectionnez à nouveau ce dossier depuis l’accueil pour restaurer ce contexte, y compris sur un autre navigateur compatible. Les fichiers du dossier sont la source lors de la réouverture ; l’ancienne copie du navigateur reste disponible séparément. Les cookies et sessions des visiteurs ne sont pas exportés dans `.alwis`.

Les écritures refusent de remplacer un fichier ou une configuration modifiés extérieurement depuis l’ouverture. Les suppressions et renommages restent dans la copie du navigateur : ils ne suppriment pas automatiquement les fichiers du PC. La sauvegarde locale est limitée aux mêmes volumes que l’export ZIP (64 Mio ; 8 Mio par sauvegarde SQL).

Le menu du projet permet de **délier le dossier du PC**. Cette action conserve les fichiers du PC et le projet du navigateur. Depuis l’accueil, la corbeille supprime un projet du navigateur après confirmation ; elle ne touche pas au dossier local ni à `.alwis` et refuse un projet ouvert ailleurs.

## Exécuter un script PHP sans aperçu HTML

Dans le menu du bouton **Aperçu**, choisissez **Exécuter PHP · sortie texte**. Le panneau **Sortie PHP** présente le résultat et le statut HTTP, avec au plus 64 Kio de texte. L’exécution utilise les fichiers appliqués et la session active ; vous pouvez continuer à éditer pendant son traitement.

Le moteur actuel traite les requêtes du projet en série. Il ne propose pas de daemon PHP permanent ou de processus parallèle indépendant : les autres requêtes attendent, et le garde-fou du moteur termine le worker après un appel de 180 secondes. Cette commande convient aux scripts ponctuels, pas aux boucles infinies ou aux serveurs persistants.

Dans **Sessions**, chaque carte propose **Supprimer** avec confirmation. Les fenêtres du visiteur sont fermées et l’aperçu revient à une session restante. Enregistrez le projet pour conserver la suppression. La dernière session est protégée ; créez-en une autre pour pouvoir la supprimer.

## Navigateur intégré et Réseau

L’aperçu présente une barre d’adresse avec **Précédent**, **Suivant** et **Recharger**. Les flèches parcourent les adresses visitées par la session principale, y compris les liens et les paramètres d’URL ; revenir à une adresse la recharge en GET. **Suivre** conserve le lien avec le fichier ouvert, **A | B** compare deux sessions et **Fenêtre** ouvre un visiteur séparé. Chaque commande possède une infobulle.

Le bouton **Réseau** ouvre un panneau sous la page. Il liste les requêtes servies par le moteur du projet, y compris les ressources, les appels fetch/XHR et les autres fenêtres du projet. Cliquez sur un nom pour conserver la liste à gauche et afficher à droite les onglets **En-têtes**, **Requête** et **Réponse**. Les corps restent du texte non exécuté ; les contenus binaires sont indiqués avec leur type et leur taille. Le panneau observe le serveur virtuel : les requêtes vers des sites externes et les ressources internes du studio n’y figurent pas. Les durées mesurent le traitement par le moteur, pas les phases DNS/TLS d’un navigateur distant.

Les 200 dernières requêtes restent en mémoire jusqu’à l’effacement ou au changement de projet. Chaque corps textuel est limité à 32 Kio ; ces traces ne sont pas sauvegardées avec le projet.

Le séparateur discret entre l’éditeur et l’aperçu règle leur largeur. Sa poignée apparaît au survol, au focus clavier et pendant le déplacement. Celle au-dessus de Réseau règle la hauteur du panneau. Glissez-les à la souris ou au toucher : la poignée devient bleue. Au clavier, utilisez **Tab**, puis les **flèches** ; **Maj** agrandit le pas et **Début/Fin** vont aux limites. Un double-clic rétablit les proportions initiales. Les proportions sont conservées dans ce navigateur. Sur mobile, l’aperçu remplace l’éditeur et seul le réglage vertical reste affiché.


## Interface et notifications

L’en-tête et le chargement affichent **ALWIS** en texte, sans logo. Les actions utilisent des icônes SVG accompagnées d’un texte ou d’une infobulle. Les commandes indisponibles sont grisées : replier des dossiers déjà fermés, parcourir une recherche sans résultat ou utiliser les outils d’un schéma vide. Une relation vers la même table reste possible dès qu’une table existe.

Les notifications distinguent réussite, information, avertissement et erreur. Trois messages au maximum restent affichés ; leur durée se suspend au survol et tant que le clavier reste dans la notification. La croix permet de fermer chaque message. Les modales disposent de leur propre bouton de fermeture et conservent Annuler.

Les règles de suppression et de modification d’une relation affichent leur mot-clé SQL officiel avec le libellé français (par exemple « RESTRICT — Empêcher la suppression »), puis une explication en français sous chaque choix, dans le schéma et le formulaire de relation. L’explication nomme les tables concernées : bloquer l’opération, répercuter le changement ou conserver les lignes en retirant leur lien (NULL). Les indications au survol d’une relation restent devant les tables du schéma.

Lorsqu’une modification de cellule échoue sur une valeur ou une contrainte reconnue, la saisie reste affichée avec son explication. Échap annule la saisie. Les refus de relation proposent d’ouvrir la table concernée ; une opération bloquée sur la table référencée peut aussi proposer de configurer la propagation dans le formulaire de relation. Ce choix doit être confirmé et ne rejoue pas automatiquement l’opération. Les suppressions bloquées indiquent le nombre réellement supprimé avant le blocage.

L’examen rapide de la RAM et les pistes non engagées sont décrits dans [Mémoire](memory-quick-review.md).

## Vérifier ou réparer la version du site

Le pied de page affiche version et build. Le bouton de mise à jour attend une vérification déjà en cours au lieu d’utiliser un résultat périmé. Avant de fermer le projet, il vérifie que l’accueil servi correspond au build annoncé ; un déploiement incomplet conserve le projet ouvert et affiche une erreur explicite. Les saisies sont bloquées pendant la sauvegarde et la bascule pour protéger le brouillon.

Si le serveur annonce déjà la version courante, une première vérification propose **Recharger cette version**, qui recharge les fichiers de l’application avec une URL fraîche sans effacer projets ou bases. Une ancienne version ne possédant pas ce correctif peut nécessiter une actualisation forcée initiale du navigateur.
