# Première interface du studio : revue du 1 novembre 2026

## Périmètre et preuves

Interface du studio navigateur, de l'ouverture du projet à l'édition, aux données et au diagnostic. HTML sémantique, modules JavaScript et CSS sans bibliothèque de composants ; conventions définies dans [INTERFACE-STUDIO.md](INTERFACE-STUDIO.md). Aucun AGENTS.md ni guide d'interface supplémentaire trouvé dans les répertoires concernés.

La revue de changement utilise `origin/main` à `380077439a496892c018decaf4872f654ce81173` comme base et `work` à `d963308`, soit 11 commits locaux, plus les fichiers de cette tranche non encore commités au moment de l'inspection. Lockfiles, binaires, reçus générés et sources natives ne constituent pas les surfaces de cette revue. 18 fichiers d’interface et de vérification dans cet inventaire après exclusions. Cinq consommateurs inspectés : coque (navigation, Clients et Ressources), éditeur, console/grille SQL, schéma et composant de diagnostic. Les moteurs natifs ont leurs preuves distinctes ; aucune revue de leur code C n'est déduite de ce rapport UI.

Skills lus et appliqués : [anti-ai-slop, prioritaire](https://github.com/Krirox/anti-ai-slop-skills/blob/b7515139a58dd3076588a3981d3d6f8d4e5bb064/SKILL.md), puis les sept `better-*`, `interface-review`, `explain-interface` et `break` de [jakubkrehel/skills à 592aedc](https://github.com/jakubkrehel/skills/tree/592aedc44d7d5b3e29740984252902f3e5402a1c/skills).

| Domaine | Preuves inspectées | Résultat |
|---|---|---|
| Accessibilité | index.html, studio-shell.mjs, édition SQL par Entrée, déplacement du schéma par flèches, dialogue Échap, axe-core 4.11.1 sur 17 états | Aucun défaut automatisé détecté ; annonces NVDA/VoiceOver non vérifiées |
| Layout | Six onglets à 320/768/1440 px dans Chromium/Firefox, agrandissement du texte 200 %, miroir RTL à 320 px dans Chromium | Aucun débordement de page dans les scénarios exécutés |
| Writing | Labels et états vides des six espaces, erreur réelle de nom projet, SQLSTATE réel, exception PHP réelle et récupération | Actions et suites indiquées ; fonctions différées identifiées |
| Typographie | Échelle en rem, texte 14 px pour l'outil dense, saisies mobiles 16 px, interlignage sans unité, nombres tabulaires, noms longs et scripts mixtes | Texte accessible dans les scénarios rendus ; zoom du chrome navigateur non vérifié |
| Couleurs | Variables sémantiques, paires calculées depuis les styles rendus, contrôle axe des états visibles | Paires mesurées au-dessus des seuils requis, valeurs ci-dessous |
| UI | États sélectionné/focus/désactivé/erreur, captures desktop/mobile, composant réel de diagnostic isolé | Surfaces plates cohérentes, aucune animation ajoutée |

## Constats et corrections

Les trois changements prioritaires ont été de remplacer les panneaux concurrents par une navigation d'atelier, de conserver les erreurs avec leur récupération et leur historique, et de rassembler les mesures et cycles de vie dans Ressources. La grille avait une entrée d'édition au double-clic ; Entrée fournit maintenant le chemin clavier. Le déplacement du schéma possède flèches et boutons, ainsi qu'une lecture textuelle complète des tables et relations.

Aucun nouveau problème d'interface bloquant confirmé dans le périmètre inspecté. Le test automatisé n'est pas une certification WCAG. Restent à approfondir les lecteurs d'écran, Safari, les très gros catalogues et la restauration du focus pendant des séries d'éditions de grille. CodeMirror et les services de langage restent un lot fonctionnel explicite.

Score anti-AI-slop après inspection : **3/30**, appréciation heuristique de la présentation, pas mesure technique. Direction retenue : atelier fonctionnel, surfaces plates, code et données au premier plan. Les points restants concernent une coque encore conventionnelle et des états de chargement essentiellement textuels. Les erreurs, valeurs et mesures montrées dans les captures proviennent des scénarios réellement exécutés.

## Contrastes mesurés

| Paire rendue | Ratio | Seuil vérifié |
|---|---:|---:|
| Texte principal / fond | 15,17:1 | 4,5:1 |
| Texte secondaire / fond | 9,14:1 | 4,5:1 |
| Bord de contrôle / fond du contrôle | 3,72:1 | 3:1 |
| Focus clavier visible / fond du contrôle | 10,71:1 | 3:1 |
| Action principale / remplissage | 12,38:1 | 4,5:1 |
| Texte d'erreur / bandeau | 8,80:1 | 4,5:1 |

Ces valeurs sont celles des paires inspectées ; elles ne remplacent pas une mesure de toute combinaison future de couleur, survol ou contraste système. Le focus a été mesuré avec `:focus-visible` réellement actif.

## Comment l'interface est construite

Constat mesuré dans le navigateur et vérifié dans les sources : la coque utilise une grille de 222 px + espace flexible sur écran large. À 850 px, la navigation passe au-dessus du contenu. Les panneaux inactifs sont masqués avec `hidden`, conservent leur DOM et leurs brouillons ; le déchargement explicite reste distinct. Aucune iframe ni nouvelle instance SQL n'est créée pour changer d'onglet.

Le journal est un modèle borné à 200 événements et des éléments `details/summary` natifs. Les messages sont insérés avec `textContent`. Les détails longs possèdent leur propre défilement clavier. Les entrées conservent ouverture et focus clavier lors de nouvelles requêtes HTTP, vérifié sur les deux navigateurs. Le journal n'est rendu à nouveau que lorsqu'il est visible ; le badge d'erreur continue de se mettre à jour. Erreurs PHP/SQL et requêtes HTTP réelles sont locales à l'onglet. L'export est une action explicite ; les corps, cookies et query strings ne sont pas ajoutés aux traces HTTP, mais des messages techniques peuvent contenir des informations du projet.

## Stress du diagnostic avec break

Page conservée : `/apps/studio/interface-stress.html`. Elle importe le vrai composant, sans restyler ses couleurs ni se connecter à un projet. Scénarios : message vide, cas courant, mot insécable long, plusieurs phrases, diacritiques/RTL/emoji, contexte et détails longs, avertissement, information, conteneur de 180 px et conteneur large. L'axe quantité n'est pas applicable au composant unitaire ; chargement et désactivation ne sont pas des états qu'il expose.

Les dix scénarios ont été rendus dans les deux navigateurs et la capture Chromium a été inspectée de haut en bas : aucune rupture visible confirmée. Les détails longs restent accessibles par défilement, les mots longs se replient. La capture est archivée avec les preuves UI. Le serveur de développement reste disponible tant que son processus est actif ; la route se relance avec `node scripts/serve-studio.mjs`.

## Vérification reproductible

Commandes exécutées avec succès :

```bash
npm test
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/studio.mjs
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/studio-shell.mjs
npm_config_cache=/tmp/wasm-npm-cache npm install --prefix /tmp/wasm-ui-audit --ignore-scripts --save-exact axe-core@4.11.1
PBL_AXE_PATH=/tmp/wasm-ui-audit/node_modules/axe-core/axe.min.js PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node scripts/audit-studio-interface.mjs
```

35 tests Node passent. Les deux suites navigateur passent sur Chromium et Firefox : fenêtres/sessions, opérations SQL, import/export/restauration et sauvegarde ; coque, erreurs réelles, export du journal, largeurs et agrandissement du texte. L'audit axe concerne Chromium, 17 états, zéro violation détectée ; ses règles nécessitant une revue manuelle sont conservées comme `incomplete` dans le JSON. Les captures et reçus se trouvent dans `apps/studio/receipts/interface/`.

Non vérifiés : parole NVDA/VoiceOver, zoom via l'interface du navigateur, Safari, conformité WCAG complète, stress de plusieurs heures. Aucun résultat de RAM totale inférieur à 300 Mio n'est annoncé par cette interface.

Verdict : **Approve pour les surfaces et contrôles inspectés**, avec les limites de vérification indiquées. Cette conclusion ne clôt pas les fonctionnalités natives, l'éditeur de langage ni l'ensemble du projet.
