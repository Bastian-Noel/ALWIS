# Éditeurs de code et SQL

CodeMirror 6 remplace les deux textarea. Le studio fournit coloration PHP/HTML/CSS/JS/JSON/SQL, numéros de lignes, pliage avec raccourcis clavier, recherche/remplacement, complétion, diagnostics, sélection, défilement et brouillons restaurables. L'arborescence utilise des dossiers natifs dépliables et des boutons de fichiers ; le sélecteur reste disponible pour changer rapidement de document.

Création, écriture, renommage et suppression agissent sur les vrais fichiers. La suppression demande confirmation. L'écriture compare la version attendue dans le worker avant de modifier le VFS ; le renommage refuse atomiquement un nom existant. Une ouverture de binaire ou de texte non UTF-8 conserve le document précédent. Le changement de fichier et le rechargement réinitialisent l'historique d'annulation pour éviter une restauration du contenu d'un autre fichier.

## Complétion PHP sans moteur PHP

Le service testé est **PHPantom LSP 0.11.1, écrit en Rust et fourni en WASI**. Il n'utilise ni un interpréteur PHP, ni PDO pour analyser le code, ni MariaDB. Il répond via les exports reactor `lsp_alloc`/`lsp_handle`/`lsp_dealloc`. Les tests de services tournent sans créer de NativeRuntime. L'ouverture d'un projet dans le studio démarre encore son runtime pour le VFS et les sites ; le service de langage n'en crée pas un second.

L'orientation utilisateur reste « php-lsp léger ». Le nom seul ne désignait pas un dépôt épinglé dans EDITEUR-CODE.md ; PHPantom est l'intégration vérifiée de ce jalon, remplaçable derrière le contrat LSP si une autre référence est précisée. Les classes d'autres fichiers du projet et les signatures PDO ont une preuve de complétion réelle. Les diagnostics sémantiques PHP complets ne sont pas exposés par le dispatcher WASI de cette version : l'éditeur signale les erreurs de syntaxe avec son parseur, et ne présente pas cela comme PHPStan.

## HTML, JavaScript et jQuery

- SuperHTML **0.7.1**, binaire WASI officiel : diagnostics HTML par LSP, stdin partagé borné, stdout JSON-RPC encadré et worker arrêtable.
- SWC **1.16.21**, WASM officiel npm : parsing JavaScript. TypeScript **5.9.3**, service JS dans le même worker : diagnostics et résolution des types/complétions.
- `@types/jquery` **3.5.33** et `@types/sizzle` **2.3.10**, MIT : déclarations virtuelles internes. Elles ne sont pas des fichiers du projet, n'apparaissent pas dans l'arborescence ou les ZIP, et n'injectent jamais jQuery à l'exécution. Des déclarations jQuery explicites du projet prennent la priorité, avec preuve d'une méthode locale de remplacement.

Les définitions de types ne sont pas un runtime jQuery ; le site doit charger la bibliothèque qu'il utilise. Les diagnostics PHP/HTML/JS sont bornés à 60 et les réponses de complétion à 100 propositions. Les réponses périmées et celles de documents inactifs sont ignorées.

## Limites et cycles de vie

Un document éditable est limité à **1 Mio UTF-8**, y compris les collages et changements effectués dans CodeMirror. Au-delà de 256 K caractères, les services d'analyse sont coupés et l'édition reste disponible. Le contexte initial du projet est limité à 64 fichiers de 64 Kio maximum et 1 Mio total ; les documents LSP ouverts sont bornés en nombre et volume, avec éviction. L'historique CodeMirror est configuré avec minDepth 20 ; il n'est pas conservé après déchargement ou changement de document.

Chaque service admet au plus 8 requêtes en attente. Stdin LSP : 1 Mio ; réponse : 2 Mio ; délais bornés avec arrêt du worker. Les tools en veille arrêtent leurs services ; le déchargement détruit workers et EditorView en gardant texte, chemin, sélection et défilement. Cela libère les références ; aucun gain de PSS n'est promis sans mesure. Les allocations internes des moteurs d'analyse et le tas JS de TypeScript demandent encore des mesures d'endurance.

Mesures ponctuelles Chromium/Firefox dans les reçus de services, **capacités linéaires WASM et non RAM globale** :

| Service | Initialisation/scénario | Après complétion PDO |
|---|---:|---:|
| PHPantom | 11,75 Mio | 21,44 Mio |
| SuperHTML | 16,94 Mio après diagnostic | — |
| SWC | 3,06 Mio après analyse JS | — |

Le tas JS de TypeScript, le code compilé et les autres processus du navigateur ne sont pas inclus. Les binaires de téléchargement sont plus gros que ces capacités ; voir `dist/ASSETS.json` apres compilation. Les services sont chargés au besoin, aucun CDN n'est requis.

## Éditeur SQL

CodeMirror MySQL, Ctrl+Entrée sur sélection ou script, jeux de résultats sélectionnables, historique local de 20 requêtes de 4 K caractères maximum, complétion des tables/colonnes du vrai catalogue (2 048 colonnes maximum). Les imports acceptent DELIMITER, commentaires exécutables mysqldump et corps de routines usuels ; le fichier est validé/découpé avant exécution, puis envoyé à PDO par instructions encadrées en binaire. Limites : import 8 Mio / 4 096 instructions, console 256 instructions. Les modes de quoting SQL inhabituels, dont les changements dynamiques de NO_BACKSLASH_ESCAPES, nécessitent encore des cas dédiés ; ce lexer ne se présente pas comme toute la grammaire MariaDB.

Les fonctions existantes de grille, insertion, suppression, schéma, sauvegarde et export SQL restent disponibles. Les formulaires de tables/colonnes/index/contraintes, le tri et le filtre simple, ainsi que le diagramme de relations sont décrits dans le [guide IDE](../../../docs/README.md). Les variantes avancées et la parité exhaustive phpMyAdmin restent ouvertes. Tab valide les suggestions ; Entrée garde son comportement de retour à la ligne. La complétion suit les régions des documents mixtes PHP/HTML/JS/CSS.

## Construire et vérifier

```sh
npm ci
npm run editor:build
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/editor-services.mjs
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/alwis-workbench.mjs
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/editor-accessibility.mjs
node scripts/package-studio.mjs
```

`fetch-editor-engines.py` vérifie les SHA-256 des archives officielles et des WASM ; les sources/licences sont identifiées dans engines.lock.json, licenses/ et THIRD-PARTY.txt de l'archive distribuée. `editor:build` assemble les dépendances npm épinglées et copie ces binaires amont : il ne prétend pas recompiler leurs sources Rust/Zig. Les binaires générés restent hors Git ; les reçus sont conservés et le manifeste courant est généré dans `dist/ASSETS.json`, hors Git. Le fichier `ASSETS.json` à la racine est une référence historique.

Preuves dans `apps/studio/receipts/editor/` : services et atelier sur Chromium/Firefox ; audit axe 4.11.1 sur onze états Chromium, 320 px et texte à 200 %. Lecteurs d'écran et Safari non vérifiés. Les skills d'interface et la revue sont référencés dans REVIEW.md.

## Mise en forme et expansion accessibles

La barre du code et le menu du fichier proposent **Formater** et **Emmet**. Le raccourci de formatage est **Alt+Maj+F** ; Ctrl+Maj+I, réservé aux outils du navigateur, n’est plus utilisé. Le sélecteur d’indentation règle aussi bien la saisie que le formatage : 2 espaces, 4 espaces ou tabulations.

Prettier 3.9.10 et son plugin PHP 0.26.0 formatent PHP/PHTML/INC, HTML, JavaScript/JSX, CSS et JSON. Ils sont regroupés dans un worker séparé, téléchargé uniquement sur demande puis terminé à la fin de chaque commande. Aucun nouveau moteur PHP d’exécution n’est chargé. La version syntaxique PHP du formateur est fixée à 8.4 : la recherche de `composer.json` sur la machine hôte est désactivée. Le formatage est limité à 256 K caractères et 10 secondes. Une erreur ou une modification du document pendant le traitement conserve le brouillon ; une mise en forme appliquée s’annule avec Ctrl/Cmd+Z. Ce n’est pas une sauvegarde automatique. SQL et TypeScript n’ont pas de formateur dans ce lot.

Les snippets locaux ne dépendent plus du démarrage ni du succès des services WASM. Tapez `for` ou `foreach` en contexte PHP/JS puis Tab pour insérer la structure, et Tab/Maj+Tab pour parcourir les champs. Les propositions apparaissent aussi à la frappe d’un préfixe. Emmet passe avant la suggestion HTML sur Tab : `ul>li*3`, par exemple, produit trois éléments. `!` puis Entrée dans un document HTML vide reste disponible. Le bouton et le menu permettent aussi de développer l’abréviation au curseur. Les snippets actifs sont abandonnés au remplacement ou au changement de document.
