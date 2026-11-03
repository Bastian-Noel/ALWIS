# Guide du studio

[Architecture](architecture.md) · [Compatibilité](compatibility.md) · [Performance](performance.md) · [Publication](deployment.md) · [Contribution](../CONTRIBUTING.md)


## Espace de travail IDE et administration SQL

La navigation principale comporte Accueil, Code, Base de données, Schéma relationnel et Clients et sessions. Ressources et Journal sont accessibles dans Outils ; import/export, exemple et fermeture sont dans Projet. Les surfaces reprennent une organisation d’éditeur : onglets horizontaux, panneaux bordés, typographie système, texte de commande et absence d’icônes décoratives.

## Projets et fichiers

Accueil ouvre un nom existant ou crée un projet vide. Les 40 derniers projets ouverts dans ce navigateur affichent leur nom, le nombre de fichiers connu et la dernière activité enregistrée. Cette liste est locale à ce studio ; elle ne prétend pas découvrir les anciens magasins créés avant son ajout.

Dans Code, l’arborescence est à droite sur grand écran et au-dessus de l’éditeur sur petit écran. Les onglets de fichiers utilisent une seule instance CodeMirror : chaque fichier conserve son brouillon et sa sélection. Création, renommage, suppression, recherche et remplacement restent disponibles. Un fichier fait au plus 1 Mio UTF-8 ; les binaires ne sont pas interprétés comme du texte. Les écritures vérifient la version de départ pour refuser l’écrasement d’une modification concurrente.

Tab accepte la suggestion visible, sinon indente. Entrée insère un retour à la ligne avec indentation ; elle n’accepte pas une suggestion. Les balises HTML se ferment automatiquement. Le parseur mixte choisit la complétion selon la zone PHP, HTML, JavaScript ou CSS, y compris JavaScript dans une balise script d’un fichier PHP. La complétion jQuery utilise les définitions internes sans ajouter ces fichiers au projet. Ctrl+Espace ouvre les suggestions et Ctrl+S écrit le fichier courant. Le bouton Sauvegarder écrit les brouillons des onglets ouverts avant de sauvegarder le projet.

PHP utilise PHPantom Rust/WASM, HTML SuperHTML, JavaScript SWC/WASM et TypeScript pour les types. Il n’y a pas de deuxième interpréteur PHP dédié à la complétion. Les diagnostics PHP sémantiques exhaustifs, Composer et les transformations de code à grande échelle ne sont pas ceux d’un VS Code complet.

## Bases, tables et données

Le premier passage dans Base de données initialise MariaDB si nécessaire. Ouvrir un projet et travailler sur un fichier PHP ne l’initialise pas à lui seul.

L’explorateur lit SHOW DATABASES et SHOW FULL TABLES. Un clic sur une table ouvre sa grille ; le sélecteur de base permet aussi d’ouvrir une base vide. Les vues SQL apparaissent avec les tables. Les vues Requête SQL, Données et Structure séparent la console de l’affichage des tables.

La grille lit 100 lignes à la fois côté serveur. Elle propose filtre simple, tri, insertion, édition et suppression. L’édition exige une clé primaire et vérifie que la ligne n’a pas changé. NULL, texte vide, binaire et nombres exacts restent distincts. Le CSV exporte le résultat courant, donc la page courante pour une table ; ce n’est pas un dump complet.

Actions regroupe création de table, modification de structure, imports et exports. Le formulaire de création définit plusieurs colonnes, types, NULL, AUTO_INCREMENT et clé primaire simple ou composée. Le formulaire de structure ajoute/modifie/renomme/supprime une colonne, crée/supprime un index, définit une clé primaire, renomme/vide/supprime une table. Chaque formulaire affiche le SQL avant application. Les attributs avancés et types absents de la liste restent accessibles en éditant ce SQL ou dans la console. Une instruction DDL peut valider implicitement les transactions ; l’interface ne promet pas d’annulation globale.

La console conserve sélection, scripts, résultats multiples et historique borné. L’import SQL reconnaît DELIMITER et les routines. L’export logique conserve les fonctionnalités déjà prises en charge par l’outil, avec refus explicite des événements et limite de 8 Mio.

## Schéma relationnel

Le diagramme utilise les colonnes, les index et les contraintes réelles de information_schema. Les tables ont un en-tête, des lignes de colonnes, leur type et les marques PK/FK/UQ. On déplace leur en-tête à la souris ou avec les flèches quand il est focalisé ; le zoom et le défilement permettent de parcourir le plan. Les positions sont conservées par base.

Glisser une clé sur une colonne prépare la création d’une clé étrangère. On peut aussi cliquer successivement les deux colonnes, ou ouvrir Créer une relation. Le dialogue permet de choisir les colonnes, une clé parente unique/primaire, les actions ON DELETE/ON UPDATE et l’ajout d’un index UNIQUE pour une relation 1–1. Les clés composées peuvent être sélectionnées ; leur ordre et le SQL sont affichés avant application. MariaDB vérifie les types, les index et les données existantes.

Les traits indiquent les multiplicités permises : 0..N côté enfant habituel, 0..1 si la clé enfant est unique ; 1 côté parent pour une clé étrangère obligatoire, 0..1 si elle accepte NULL. Le cas d’une référence à un index non unique est distingué. Une clé étrangère ne garantit pas qu’un parent possède au moins un enfant. Une relation N–N nécessite une table de liaison ; le bouton dédié la crée avec deux clés étrangères et une clé primaire composée. Le lien conceptuel N–N est annoté en pointillé en plus des vraies contraintes.

La liste des relations offre modification et suppression des contraintes, avec SQL vérifiable. Modifier une relation conserve les index existants ; retirer une unicité passe par Structure. Les relations vers une autre base sont décrites en texte et ne sont pas éditées comme si la table parente était présente dans le plan.

Limites du plan : 50 tables et 2 000 colonnes. Pas de routage automatique évitant tous les croisements ni d’édition en masse des migrations. Le formulaire N–N vise deux clés simples ; les variantes composées ou réflexives restent faisables dans SQL. Les formulaires de privilèges, procédures, événements et utilisateurs ne constituent pas une copie exhaustive de phpMyAdmin.

## Clients et diagnostic

Chaque identité affiche son nom, son nombre de fenêtres et de cookies. On peut la renommer, ouvrir plusieurs clients avec la même identité ou créer une identité indépendante. Les fenêtres ouvertes depuis le studio proposent Afficher, Recharger et Fermer. Elles partagent les fichiers et la base du projet, pas nécessairement leurs cookies. Les onglets fermés sont retirés à la prochaine actualisation de la vue ou au retour de focus du studio.

Journal présente niveau, heure, message et détail dépliable, avec filtre et export JSON. Il reste borné à 200 événements. Ressources conserve les mesures du moteur et le cycle de vie des outils sans occuper la navigation principale. La capacité WASM n’est pas la consommation totale du navigateur.

## Archives ZIP

Exporter le projet ZIP écrit les brouillons ouverts, collecte les fichiers et, si MariaDB est active, les dumps des bases utilisateur. Le manifeste et les dumps résident dans `.pbl-backup/` à l’intérieur de l’archive ; ce dossier n’est pas copié dans les fichiers du site lors de l’import. Les sessions clientes ne sont pas incluses.

L’import accepte également les ZIP de fichiers ordinaires. Il vérifie chemins, doublons, CRC, nombre et taille des fichiers avant écriture. Une collision de fichier ou une base contenant déjà des tables est refusée : importer dans un nouveau projet évite d’écraser un travail existant. Une erreur SQL indique un import partiel ; les DDL ne forment pas une transaction de restauration globale.

Compression et décompression s’exécutent dans un worker court, avec CompressionStream/DecompressionStream du navigateur et transfert des buffers. Un navigateur sans compression deflate-raw reçoit un ZIP stocké compatible. Aucun moteur WASM ZIP supplémentaire n’a été ajouté sans gain mesuré. Budgets : 64 Mio décompressés, 1 024 entrées, 8 Mio par fichier importé et par dump SQL ; ces limites restent celles d’un prototype local.

## Preuves

`tests/browser/alwis-workbench.mjs` vérifie le parcours réel dans Chromium et Firefox ; les reçus et captures actuels sont dans `apps/studio/receipts/alwis/`. Les reçus `ide/` concernent l’ancienne interface. Les tests de modèle couvrent cardinalités, clés composées, tables de liaison et validation des types de formulaire. Les scénarios existants vérifient aussi la concurrence, les types exacts, la sauvegarde et les sessions. Axe couvre onze états inspectés, dont le schéma et les dialogues DDL/FK, sans remplacer un essai lecteur d’écran ou Safari.

Skills appliqués : [anti-ai-slop](https://github.com/Krirox/anti-ai-slop-skills/blob/b7515139a58dd3076588a3981d3d6f8d4e5bb064/SKILL.md), [better-interface](https://github.com/jakubkrehel/skills/blob/592aedc44d7d5b3e29740984252902f3e5402a1c/skills/better-interface/SKILL.md), better-layout et better-accessibility. La direction visuelle est celle d’un IDE sobre, sans décorations ajoutées aux commandes.

## Aide à l’écriture

Voir [Confort de l’éditeur et diagnostics](README.md) pour les raccourcis, corrections proposées, budgets et limites du service de langage.


## Confort de l’éditeur et diagnostics

Cette évolution conserve CodeMirror 6, PHPantom WASM, SuperHTML et le service TypeScript/SWC. Emmet 0.4.2 assure les expansions. Le formateur Prettier et son plugin PHP sont chargés sur demande dans un worker séparé ; aucun moteur WASM supplémentaire n’est introduit.

## Disponible

- Snippets PHP (`foreach`, `for`, `while`, `if`, `function`, `try`) et JavaScript : blocs indentés, champs Tab/Maj+Tab, corps final.
- Entrée conserve son rôle de retour à la ligne. Exception explicite : `!` dans un document HTML vide développe le squelette HTML. Emmet se déclenche par bouton/menu, avec Tab ou Ctrl/Cmd+Maj+M en contexte HTML/CSS ; commentaires et valeurs d’attributs sont exclus.
- Paires de parenthèses, indentation, balises HTML via les extensions CodeMirror ; extensions PHP/PHTML/INC et JS/JSX/TS/TSX, insensibles à la casse.
- Filtrage des complétions selon le préfixe et le contexte. Après `$`, variables PHP uniquement, avec priorité aux déclarations de la portée courante. Les types jQuery restent invisibles dans les fichiers utilisateur.
- Documentation de la proposition sélectionnée chargée à la demande, descriptions au survol, aide au paramètre actif. Le texte externe est affiché comme texte, jamais comme HTML.
- Panneau Problèmes, navigation par diagnostic, corrections proposées explicitement. Pour PHP : point-virgule testé sur une copie par le parseur ; faute de casse ou nom proche d’une variable déclarée dans la même portée. Les constructions dynamiques et les candidats ambigus empêchent cette dernière suggestion.
- Pour JavaScript : diagnostics et corrections locales fournis par TypeScript, sans réinventer son analyse sémantique.
- Définition (F12), références (Maj+F12 lorsque le fournisseur les expose), retour (Alt+Gauche), symboles du fichier et recherche textuelle dans les fichiers indexés.
- Renommage sémantique (F2), aperçu puis application en une transaction annulable. Un changement touchant plusieurs fichiers est refusé explicitement : aucune modification partielle.
- Commenter (Ctrl/Cmd+/), formater le fichier (bouton, menu ou Alt+Maj+F ; indentation réglable), recherche/remplacement local et commandes de ligne CodeMirror.
- Passage à un fichier cible par le chemin habituel de l’application, qui conserve les brouillons.

## Coût et limites

Analyse limitée à 256 K caractères par document ; édition à 1 Mio UTF-8. Contexte projet borné à 64 fichiers / 1 Mio de caractères, avec 64 K caractères par fichier. Résultats de recherche : 100 maximum. Historique de navigation : 30 positions. Aide aux paramètres temporisée et une seule requête en vol. Au plus quatre essais de réparation syntaxique PHP par analyse. Les services restent déchargeables.

Le module de l’éditeur augmente d’environ 110–120 Ko non compressés, essentiellement pour Emmet. Cela mesure le fichier JavaScript livré, pas la RAM du navigateur. Aucun gain de mémoire du runtime PHP/MariaDB n’est revendiqué.

Le contexte est un index borné, pas l’intégralité garantie d’un gros projet. Les fichiers enregistrés et les brouillons quittés actualisent leur entrée ; les modifications externes exigent un rechargement. La recherche ne remplace pas encore dans plusieurs fichiers. Le renommage coordonné de plusieurs fichiers, le formatage des langages encore non pris en charge, le renommage lié des balises, les complétions de chemins/classes CSS et la présentation enrichie des traces d’exécution restent à finaliser. Les références PHP dépendent des capacités annoncées par PHPantom (non disponibles dans la version embarquée). Une variable inconnue ne reçoit pas systématiquement une correction : les propositions sont conservatrices.

## Validation

- `npm test` : tests existants et tests de portée, ambiguïté et réparation PHP.
- `node tests/browser/editor-intelligence.mjs` : vrais claviers Chromium/Firefox, snippets, HTML, Emmet, corrections, signatures, documentation, navigation, renommage et Entrée.
- `node tests/browser/alwis-workbench.mjs` : parcours existants code et SQL, conflits, persistance et petits écrans.
- `node tests/browser/alwis-accessibility.mjs` : onze états contrôlés avec axe.

Le parcours de confort est ajouté à la validation commune CI/publication. Ces contrôles ne constituent pas une validation manuelle de tous les lecteurs d’écran ni une équivalence fonctionnelle complète avec VS Code.


## Ordre de réalisation actif

Instruction utilisateur : terminer d'abord PHP pour les projets simples et consolider PDO/MySQLi, ensuite réaliser le vrai éditeur de site, enfin terminer l'administration SQL. Cet ordre remplace celui du bilan qui plaçait la diffusion avant ces fonctionnalités. La publication ne doit pas interrompre ce travail lorsque le service d'hébergement est inaccessible.

## 1. PHP et accès SQL

Premier lot PHP : filter, ctype, tokenizer, fileinfo, mbstring et iconv, avec preuves de validation, Unicode, types MIME et encodages. Le sous-module mbregex dépend d'Oniguruma et n'est pas promis par l'activation de mbstring sans cette dépendance.

**Surface procédurale complétée :** [106 fonctions enregistrées avec politiques explicites et limites](../engine/fusion/MYSQLI-106-RECEIPT.md).

**Premier lot livré :** ces six extensions, types numériques PDO avec stringify et conservation des valeurs exactes, savepoints MySQLi procéduraux/objet. Preuves et limites : [PHP essentiel](../engine/fusion/PHP-ESSENTIALS-RECEIPT.md). Les lignes suivantes restent le travail à poursuivre ; ce lot ne clôt pas toute la phase 1.

Compléter ensuite les besoins de fichiers et documents (zlib/ZIP, DOM/XML/SimpleXML) avec dépendances épinglées. Décider des ajouts crypto/images selon les projets de référence. Conserver les sources, recettes et témoins précédents ; mesurer le coût des extensions avant de définir d'autres profils.

Approfondir la conformité PDO : variantes de types/attributs, LOB en flux, curseurs et résultats multiples. MySQLi dispose des nouveaux chemins options/diagnostics/long-data/résultats multiples ; approfondir leurs variantes, les classes/propriétés et les anciens alias objet. Les API hors contexte du serveur embarqué doivent avoir une politique explicite, sans fausse réussite.

Sortie : petits projets PHP CRUD/authentification/upload importés sans réécrire PDO/MySQLi ; erreurs récupérables, transactions, valeurs exactes, quotas et nettoyage prouvés. Alterner fonctionnalités et validations ciblées, sans répéter les compilations amont sans nécessité.

## 2. Vrai éditeur de site

**Lot livré :** CodeMirror, arborescence et opérations de fichiers, recherche/remplacement, services PHP/HTML/SWC, déclarations jQuery internes, cycle de vie et protections des écritures. [Fonctions et limites actuelles](../apps/studio/editor/README.md).

Approfondir les diagnostics PHP sémantiques, le contexte Composer, les diagnostics des documents mixtes, les opérations sur dossiers et l’endurance des services ; compléter les vérifications lecteurs d’écran et Safari.

## 3. Administration SQL complète

**Lot livré :** CodeMirror MySQL, sélection/scripts, résultats multiples, historique, catalogue réel pour la complétion et import DELIMITER/routines. L’explorateur bases/tables, les grilles filtrées/triées, les formulaires DDL, les relations visuelles et le ZIP multi-bases sont désormais livrés : [espace IDE](README.md). La parité exhaustive phpMyAdmin reste ouverte.

Approfondir les variantes avancées de colonnes et index, les formulaires de routines et privilèges, les gros imports/dumps, les dispositions de schémas denses et les restaurations interrompues. Garder les contrôles de concurrence, types exacts, erreurs utiles et budgets ; valider sur un vrai projet avec les outils déjà livrés.

Le bilan du 1 novembre reste une photographie des capacités ; ce fichier définit l'ordre de travail suivant, pas une déclaration de fonctionnalités terminées.


## Interface ALWIS

L’atelier principal utilise la nouvelle présentation : rail Code / Données / Schéma / Sessions, aperçu intégré simple ou comparé, explorateur, palette et panneau Serveur. Les icônes et badges conservent leurs couleurs dans les deux thèmes ; leurs contrastes ont été ajustés.

Dans **Données → Structure**, « Colonne » ouvre le formulaire complet : type avec longueur/précision, NULL, défaut absent/NULL/littéral/expression, AUTO_INCREMENT, clé, commentaire, charset, collation et position. Une modification rapide du type ou de NULL conserve les autres attributs depuis SHOW CREATE TABLE. « Définition complète » permet de modifier les attributs SQL avancés sans les effacer implicitement. Les colonnes générées passent par cette définition complète.

La grille distingue les valeurs exactes ; les binaires s’affichent en hexadécimal et ont leur éditeur dédié. « Insérer avec options » distingue DEFAULT, NULL, texte vide et binaire. Une modification/suppression vérifie les valeurs originales de la ligne. Le schéma conserve les clés composées et propose un formulaire utilisable au clavier en complément du glisser-déposer.

« Enregistrer » applique les brouillons aux fichiers lus par PHP. « Sauvegarder » conserve le projet dans ce navigateur et redémarre le moteur. « Fermer sans sauvegarder » abandonne les modifications du moteur depuis le dernier checkpoint ; les brouillons locaux restent récupérables. Le ZIP inclut les fichiers et les bases utilisateur, même lorsque SQL est dormant après une sauvegarde. Les sessions clientes restent exclues des ZIP.

Les anciens ZIP applicatifs publiés avant ALWIS gardent leur interface d’origine. Les captures actuelles sont celles du code source ALWIS ; elles ne modifient pas rétroactivement ces versions.

[Consolidation PDO/MySQLi et cycle des projets](../packages/php-native/stability.md) : défaut reproduit de réservation des buffers, contrôles de transactions et curseurs, ouverture concurrente et optimisation du montage de la console SQL.
