# Origine de l’interface ALWIS

Présentation fournie par l’utilisateur dans `files (1).zip`, contenant `adapter-studio-v2.zip` et un patch de proposition. La présentation et les interactions ont été intégrées sous apps/studio/workbench/. Le moteur simulé, les pages de démonstration standalone et l’adaptateur natif provisoire ne sont pas livrés.

Les services de production utilisent ProjectHub, NativeRuntime, le stockage et les archives existants. CodeMirror et les services PHP/JavaScript sont ceux du dépôt. Les champs de structure, la précision SQL, les contraintes composées, les conflits, l’export de SQL dormant, les contrastes et la reprise des brouillons ont été consolidés. Les anciens reçus restent liés aux versions précédentes ; les captures ALWIS sont produites par les tests navigateur réels.

Le nom public devient ALWIS — Atelier Local Web avec IDE et SQL. Les formats historiques de sauvegarde et les clés de stockage restent compatibles ; les anciennes releases et leurs noms de fichiers ne sont pas modifiés rétroactivement. Aucune licence globale n’est choisie lors de cette intégration ; les icônes de la présentation fournie ne constituent pas une nouvelle dépendance externe.

Validation locale : 49 tests Node, 15 parcours de l’atelier dans Chromium et Firefox (dont glisser-déposer d’une vraie contrainte, conflits SQL/fichiers, ZIP après redémarrage, restauration SQL, déchargement), dix états axe dans les deux thèmes, services de langage et confort de frappe, 106 entrées MySQLi et paquet statique sur les deux navigateurs. Les reçus détaillent la portée ; ils ne constituent pas une validation manuelle des lecteurs d’écran ni de Safari.

L’ancien contrôleur studio, sa feuille de style, ses dialogues SQL et son composant de schéma ont été supprimés. Le modèle relationnel pur et les tests correspondants sont conservés dans database/relation-model.mjs. Les suites liées à l’ancien DOM ont été remplacées par les parcours ALWIS ; les tests des moteurs natifs et services de langage sont conservés. Les URL et formats de sauvegarde historiques n’ont pas été renommés.
