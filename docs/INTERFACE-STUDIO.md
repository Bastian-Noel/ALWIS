# Studio : première interface de travail

## Orientation et sources

Atelier de développement dense et fonctionnel : surfaces plates, angles de 3 px, fond graphite, accent ivoire pour l'action principale, texte système et code monospace. Navigation stable et contenu pleine largeur. Les couleurs d'erreur et d'avertissement portent aussi un libellé. Aucun chiffre de projet ni schéma fictif n'est présenté comme réel.

Demande utilisateur : appliquer en priorité [anti-ai-slop](https://github.com/Krirox/anti-ai-slop-skills/blob/b7515139a58dd3076588a3981d3d6f8d4e5bb064/SKILL.md), puis les [skills d'interface](https://github.com/jakubkrehel/skills/tree/592aedc44d7d5b3e29740984252902f3e5402a1c/skills) : better-interface, better-ui, better-typography, better-colors, better-accessibility, better-layout, better-writing ; revue avec interface-review, explication avec explain-interface et stress d'un composant avec break. Sources lues à ces révisions, sans installation globale.

## Navigation et actions

| Espace | Besoin | Action principale | Autres actions et états |
|---|---|---|---|
| Projet, barre globale | Ouvrir un propriétaire et conserver son travail | Sauvegarder le projet | Ouvrir, fermer proprement, état des modifications ; erreur de sauvegarde persistante |
| Code | Choisir, modifier et écrire un fichier | Écrire le fichier | Chemin, liste, recharger, position du curseur, brouillon ; absence de fichier guidée |
| SQL et données | Exécuter une requête et administrer les lignes | Exécuter | Tables, pagination, structure/index, insertion, édition, suppression confirmée, import/export SQL |
| Schéma | Comprendre et modifier les relations réelles | Lire le schéma | DDL, création de clé étrangère, déplacement avec clavier et commandes accessibles |
| Clients | Ouvrir N fenêtres et choisir le partage d'identité | Ouvrir dans cette session | Nouveau client indépendant ; identifiants de sessions réels, base commune |
| Ressources | Lire les mesures et maîtriser les outils | Actualiser les mesures | Capacité WASM distincte du tas et de la RAM navigateur ; mise en veille/déchargement des outils |
| Journal | Comprendre une erreur et récupérer ses détails | Exporter le journal | Filtrer, déplier, effacer ; 200 événements maximum, messages/détails bornés, conservés dans cet onglet |

Les changements d'onglet masquent le panneau sans détruire son brouillon. Les contrôles de cycle de vie dans Ressources conservent le mécanisme explicite de déchargement. Les services lourds de l'éditeur devront avoir leur propre cycle de vie.

## États et limites

Avant ouverture, chaque espace explique ce qu'il contient et comment commencer. Chargement et sauvegarde sont annoncés dans une région stable. Une erreur affiche son contexte, une piste de récupération et un accès au journal ; aucun rejeu automatique d'une écriture PHP/SQL. Les données SQL et les fichiers restent soumis aux quotas du moteur.

L'éditeur initial est encore un textarea : son interface est structurée, mais CodeMirror 6 et les services de langage ne sont pas présentés comme disponibles. L'orientation [CodeMirror/WASM et définitions jQuery invisibles](EDITEUR-CODE.md) reste l'étape suivante. La grille SQL fonctionne réellement ; elle ne constitue pas une installation de phpMyAdmin.

Les onglets utilisent sélection ARIA et clavier flèches/Début/Fin ; les actions restent des boutons natifs. Vérification visée : largeur 320 px, zoom/agrandissement du texte, chaînes longues, erreurs, zéro ligne et navigation clavier. Les résultats observés sont consignés dans le rapport de revue séparé ; ce document décrit le contrat, pas une certification WCAG.
