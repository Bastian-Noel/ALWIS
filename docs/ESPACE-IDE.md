# Espace de travail IDE et administration SQL

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

`tests/browser/ide-workspace.mjs` vérifie le parcours réel dans Chromium et Firefox ; les reçus et captures sont dans `apps/studio/receipts/ide/`. Les tests de modèle couvrent cardinalités, clés composées, tables de liaison et validation des types de formulaire. Les scénarios existants vérifient aussi la concurrence, les types exacts, la sauvegarde et les sessions. Axe couvre onze états inspectés, dont le schéma et les dialogues DDL/FK, sans remplacer un essai lecteur d’écran ou Safari.

Skills appliqués : [anti-ai-slop](https://github.com/Krirox/anti-ai-slop-skills/blob/b7515139a58dd3076588a3981d3d6f8d4e5bb064/SKILL.md), [better-interface](https://github.com/jakubkrehel/skills/blob/592aedc44d7d5b3e29740984252902f3e5402a1c/skills/better-interface/SKILL.md), better-layout et better-accessibility. La direction visuelle est celle d’un IDE sobre, sans décorations ajoutées aux commandes.

## Aide à l’écriture

Voir [Confort de l’éditeur et diagnostics](CONFORT-EDITEUR.md) pour les raccourcis, corrections proposées, budgets et limites du service de langage.
