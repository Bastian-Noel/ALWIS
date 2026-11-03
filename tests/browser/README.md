# Validation navigateur

- `alwis-workbench.mjs` : interface réelle Chromium/Firefox, SQL et précision des valeurs, colonnes, contraintes composées, CodeMirror, clients PHP, conflits, sauvegarde, ZIP, déchargement, thèmes et tailles d’écran.
- `alwis-accessibility.mjs` : contrastes et sémantique avec axe sur les thèmes, dialogues, éditeur, structure, schéma, sessions et ressources.
- `site-package.mjs` : paquet statique exact, isolation, PDO/MySQLi, démarrage SQL différé et client routé.
- `editor-intelligence.mjs` et `editor-services.mjs` : confort de frappe et moteurs de langage.
- `mysqli-complete.mjs`, `php-essentials.mjs`, `network-native.mjs`, `restart-native.mjs` : API et comportements du moteur compilé ; les fixtures et reçus restent distincts des tests d’interface.
- `load-native.mjs` : charge offerte de deux clients avec mesures globales de processus ; ce scénario court n’est pas une preuve d’endurance.

La CI commune fixe les versions Playwright et exécute les suites requises. Les contrôles automatisés ne remplacent pas une validation manuelle avec lecteur d’écran ou Safari. Les anciens reçus d’interface restent historiques ; les reçus ALWIS sont sous `apps/studio/receipts/alwis/`.
