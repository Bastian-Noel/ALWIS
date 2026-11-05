# Validation navigateur

- `alwis-workbench.mjs` : interface réelle Chromium/Firefox, SQL et précision des valeurs, colonnes, contraintes composées, CodeMirror, clients PHP, conflits, sauvegarde, ZIP, déchargement, thèmes et tailles d’écran.
- `alwis-accessibility.mjs` : contrastes et sémantique avec axe sur les thèmes, dialogues, éditeur, structure, schéma, sessions et ressources.
- `site-package.mjs` : paquet statique exact, isolation, PDO/MySQLi, démarrage SQL différé et client routé.
- `editor-intelligence.mjs` et `editor-services.mjs` : confort de frappe et moteurs de langage.
- `mysqli-complete.mjs`, `php-essentials.mjs`, `network-native.mjs`, `restart-native.mjs` : API et comportements du moteur compilé ; les fixtures et reçus restent distincts des tests d’interface.
- `load-native.mjs` : charge offerte de deux clients avec mesures globales de processus ; ce scénario court n’est pas une preuve d’endurance.

La CI commune fixe les versions Playwright et exécute les suites requises. Les contrôles automatisés ne remplacent pas une validation manuelle avec lecteur d’écran ou Safari. Les anciens reçus d’interface restent historiques ; les reçus ALWIS sont sous `apps/studio/receipts/alwis/`.

## Parcours de l’espace de travail

`node tests/browser/workspace-design.mjs` vérifie l’enregistrement unifié, le changement de projet sans perte, la création inline, la recherche sur toutes les pages et les relations simples ou composées. Il audite les écrans avec axe en clair, sombre et sur mobile. Les captures et le rapport de l’exécution sont générés dans `build-work/workspace-design/`.

Par défaut, les tests utilisent les navigateurs Playwright de la CI. Pour vérifier localement avec un Chromium système, `ALWIS_CHROMIUM_PATH=/usr/bin/chromium` est pris en charge par ce parcours, `keyboard.mjs` et `site-package.mjs chromium`. Ce contrôle ne remplace pas une exécution sous Firefox.

Les parcours `disk-storage.mjs` et `disk-migration.mjs` contrôlent le stockage OPFS, un média de 256 Mio, les lectures PHP bornées, Range/HEAD, les exports en flux et la migration de checkpoints IDBFS. Voir [les budgets et limites](../../docs/storage-opfs.md).
