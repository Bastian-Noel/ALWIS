# Édition du code web — orientation retenue

Recommandation explicite de l’utilisateur, enregistrée le 31 octobre 2026. Le [prototype intégré du 1 novembre](../apps/studio/editor/README.md) utilise CodeMirror 6, PHPantom LSP en Rust/WASI, SuperHTML et SWC avec un service TypeScript pour les définitions jQuery. La complétion PHP ne doit jamais nécessiter un interpréteur PHP supplémentaire. Les paragraphes suivants conservent les exigences et la méthode de validation ; leur état actuel est dans le reçu lié.

## Composants demandés

- **CodeMirror 6** pour l'édition PHP, HTML, CSS et JavaScript.
- **Services dans un environnement WASM : `php-lsp` + SuperHTML + SWC ou Babel-light.** Le dépôt exact de `php-lsp`, les versions, l'option JavaScript et leur intégration WASM restent à épingler après un prototype ciblé.
- **Un fichier interne de définitions de types pour jQuery**, invisible pour l'utilisateur, utilisé par l'analyse JavaScript et les complétions.

Il s'agit de l'orientation à poursuivre, pas d'une affirmation que ces trois projets se compilent et coopèrent déjà sans adaptation dans un seul binaire WASM. L'intégration doit conserver un unique module principal PHP/MariaDB pour l'exécution des projets. Les services d'édition ont un cycle de vie distinct de ce moteur ; fixer leur packaging WASM après vérification de la faisabilité et de la mémoire.

## Définitions jQuery internes

Prévoir un fichier virtuel de type `jquery.d.ts`, fourni par le studio dans un espace de bibliothèques interne en lecture seule :

- absent de l'explorateur de fichiers, des imports/exports du projet et des diagnostics exposant les chemins internes ;
- disponible pour l'analyse de `$`, `jQuery`, des sélecteurs, méthodes, signatures et chaînages ;
- version de jQuery et provenance/licence des définitions verrouillées ; préférer les déclarations connues du projet si elles existent, sans créer de doublons ;
- aucune insertion de ce fichier ni de ses déclarations dans le JavaScript exécuté par le navigateur ;
- cette bibliothèque de types ne charge pas jQuery à l'exécution et ne doit pas masquer l'absence de la vraie bibliothèque dans le projet.

SWC et Babel sont d'abord des parseurs/transformateurs. Lire un AST ne fournit pas à lui seul une résolution de types et une autocomplétion sémantique. Le prototype doit donc démontrer la consommation des déclarations `.d.ts` et la résolution des signatures, plutôt que seulement parser les fichiers JS. Ne pas annoncer cette fonction avant preuve.

## Exigences de mémoire et de cycle de vie

Charger les services au premier besoin ; ne pas les démarrer avec le moteur PHP/MariaDB. Séparer l'éditeur, les services de langage et le runtime des projets. Mutualiser les services entre documents d'un même projet lorsque cela réduit effectivement la mémoire.

Limiter taille/nombre de documents ouverts, index, caches, diagnostics et demandes en attente. Utiliser des mises à jour incrémentales, annuler les analyses périmées, ignorer leurs réponses tardives et éviter de reparcourir tout le projet à chaque frappe.

Au déchargement, conserver texte, sélection, position et état utile, puis libérer les Workers/services et leurs références. Mesurer séparément coût initial, tas occupé, capacité WASM, RAM navigateur et coût de réactivation. Les résultats syntaxiques doivent rester disponibles si un service sémantique est indisponible, avec un état clair.

## Parcours d’acceptation du prototype

1. Remplacer le textarea par CodeMirror 6 avec chargement des langages à la demande, sans perdre l'écriture VFS, les brouillons et la restauration existants.
2. Épingler les sources et vérifier le démarrage WASM de `php-lsp` et SuperHTML, puis transport, diagnostics et arrêt propre.
3. Comparer SWC et Babel-light sur parsing incrémental ou ciblé, JSX/JS selon périmètre, consommation mémoire et accès aux définitions internes.
4. Démontrer une complétion jQuery : `$()` puis `.`, signatures et documentation, sans fichier de types visible dans l'explorateur ou le ZIP.
5. Vérifier les documents PHP/HTML avec CSS et JS intégrés, les changements rapides de fichier et les analyses annulées.
6. Mesurer édition seule, services actifs, déchargement et restauration. Choisir les réglages avec ces résultats.

La première intégration et la complétion jQuery ont maintenant leurs preuves navigateur. Les diagnostics PHP sémantiques complets, l’endurance et une matrice approfondie des documents mixtes restent à finaliser.
