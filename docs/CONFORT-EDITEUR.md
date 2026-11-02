# Confort de l’éditeur et diagnostics

Cette évolution conserve CodeMirror 6, PHPantom WASM, SuperHTML et le service TypeScript/SWC. Emmet 0.4.2 est la seule nouvelle dépendance directe ; aucun moteur WASM supplémentaire n’est introduit.

## Disponible

- Snippets PHP (`foreach`, `for`, `while`, `if`, `function`, `try`) et JavaScript : blocs indentés, champs Tab/Maj+Tab, corps final.
- Entrée conserve son rôle de retour à la ligne. Exception explicite : `!` dans un document HTML vide développe le squelette HTML. Emmet se déclenche avec Tab ou Ctrl/Cmd+Maj+M en contexte HTML/CSS ; commentaires et valeurs d’attributs sont exclus.
- Paires de parenthèses, indentation, balises HTML via les extensions CodeMirror ; extensions PHP/PHTML/INC et JS/JSX/TS/TSX, insensibles à la casse.
- Filtrage des complétions selon le préfixe et le contexte. Après `$`, variables PHP uniquement, avec priorité aux déclarations de la portée courante. Les types jQuery restent invisibles dans les fichiers utilisateur.
- Documentation de la proposition sélectionnée chargée à la demande, descriptions au survol, aide au paramètre actif. Le texte externe est affiché comme texte, jamais comme HTML.
- Panneau Problèmes, navigation par diagnostic, corrections proposées explicitement. Pour PHP : point-virgule testé sur une copie par le parseur ; faute de casse ou nom proche d’une variable déclarée dans la même portée. Les constructions dynamiques et les candidats ambigus empêchent cette dernière suggestion.
- Pour JavaScript : diagnostics et corrections locales fournis par TypeScript, sans réinventer son analyse sémantique.
- Définition (F12), références (Maj+F12 lorsque le fournisseur les expose), retour (Alt+Gauche), symboles du fichier et recherche textuelle dans les fichiers indexés.
- Renommage sémantique (F2), aperçu puis application en une transaction annulable. Un changement touchant plusieurs fichiers est refusé explicitement : aucune modification partielle.
- Commenter (Ctrl/Cmd+/), réindenter une sélection (Ctrl/Cmd+Maj+I), recherche/remplacement local et commandes de ligne CodeMirror.
- Passage à un fichier cible par le chemin habituel de l’application, qui conserve les brouillons.

## Coût et limites

Analyse limitée à 256 K caractères par document ; édition à 1 Mio UTF-8. Contexte projet borné à 64 fichiers / 1 Mio de caractères, avec 64 K caractères par fichier. Résultats de recherche : 100 maximum. Historique de navigation : 30 positions. Aide aux paramètres temporisée et une seule requête en vol. Au plus quatre essais de réparation syntaxique PHP par analyse. Les services restent déchargeables.

Le module de l’éditeur augmente d’environ 110–120 Ko non compressés, essentiellement pour Emmet. Cela mesure le fichier JavaScript livré, pas la RAM du navigateur. Aucun gain de mémoire du runtime PHP/MariaDB n’est revendiqué.

Le contexte est un index borné, pas l’intégralité garantie d’un gros projet. Les fichiers enregistrés et les brouillons quittés actualisent leur entrée ; les modifications externes exigent un rechargement. La recherche ne remplace pas encore dans plusieurs fichiers. Le renommage coordonné de plusieurs fichiers, le formatage complet des documents multilangages, le renommage lié des balises, les complétions de chemins/classes CSS et la présentation enrichie des traces d’exécution restent à finaliser. Les références PHP dépendent des capacités annoncées par PHPantom (non disponibles dans la version embarquée). Une variable inconnue ne reçoit pas systématiquement une correction : les propositions sont conservatrices.

## Validation

- `npm test` : tests existants et tests de portée, ambiguïté et réparation PHP.
- `node tests/browser/editor-intelligence.mjs` : vrais claviers Chromium/Firefox, snippets, HTML, Emmet, corrections, signatures, documentation, navigation, renommage et Entrée.
- `node tests/browser/editor-workbench.mjs` : parcours existants code et SQL, conflits, persistance et petits écrans.
- `node tests/browser/editor-accessibility.mjs` : onze états contrôlés avec axe.

Le parcours de confort est ajouté à la validation commune CI/publication. Ces contrôles ne constituent pas une validation manuelle de tous les lecteurs d’écran ni une équivalence fonctionnelle complète avec VS Code.
