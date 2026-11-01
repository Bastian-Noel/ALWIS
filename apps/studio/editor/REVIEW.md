# Revue des éditeurs — 1 novembre 2026

Périmètre : CodeMirror et ses services, fichiers du projet, console SQL, dialogues et cycle actif/veille/déchargé. Le studio utilise HTML/CSS/modules natifs et ses tokens graphite/ivoire ; aucune bibliothèque de composants supplémentaire n'est introduite.

Skills appliqués : [anti-ai-slop](https://github.com/Krirox/anti-ai-slop-skills/blob/b7515139a58dd3076588a3981d3d6f8d4e5bb064/SKILL.md) en priorité ; [better-interface](https://github.com/jakubkrehel/skills/blob/592aedc44d7d5b3e29740984252902f3e5402a1c/skills/better-interface/SKILL.md), avec les disciplines accessibility/layout/writing/typography/colors/ui du même commit. Le style existant est conservé : surfaces plates, actions nommées et une action primaire par outil.

| Domaine | Vérification et résultat |
|---|---|
| Accessibilité | Dialogues nommés, erreurs reliées au champ et focus de correction ; contrôles natifs pour dossiers/fichiers ; Ctrl+S, Ctrl+Entrée, Ctrl+F, Ctrl+Espace, création par Entrée ; pliage avec raccourcis CodeMirror |
| Mise en page | Parcours code/SQL aux largeurs 320/768/1440 sans débordement de page ; contrôle à 200 % de texte ; seuls les éditeurs/menus/grilles portent leur défilement |
| Texte | Actions créer/écrire/renommer/supprimer ; confirmation de suppression ; conflits d'écriture et refus binaire expliqués ; état réel des services, limitations de syntaxe/sémantique distinctes |
| Typographie | Police système pour l'interface, monospace pour le code, corps à 1 rem sur petit écran, lignes et sélection visibles, footer actualisé après changement de fichier |
| Couleurs | Tokens existants, coloration lisible sur le fond sombre, focus ivoire/ambre ; contraste contrôlé par axe sur les états exécutés |
| UI | Recherche et complétion locales à CodeMirror ; modèles/Workers détruits au déchargement ; brouillon et sélection restaurés ; pas d'animation ajoutée |

Problèmes corrigés pendant la revue : dialogue sans nom explicite, Entrée qui annulait le dialogue au lieu de créer le fichier, footer périmé après suppression, ouverture binaire qui pouvait désynchroniser chemin et document, historique d'annulation traversant les changements de fichier, conflit d'écriture vérifié hors de l'opération atomique du worker. Les scénarios fonctionnels vérifient aussi qu'une écriture PHP concurrente ne détruit pas le brouillon et que les définitions internes sont absentes du vrai ZIP exporté.

Preuves : `editor-workbench.mjs` et `editor-services.mjs` sur Chromium/Firefox ; `editor-accessibility.mjs` avec axe 4.11.1 sur huit états Chromium, zéro violation détectée. Les reçus `incomplete` restent conservés ; ils ne constituent pas une preuve manuelle. Les captures ont été inspectées visuellement. La suite studio antérieure passe aussi sur les deux navigateurs, y compris export/restauration SQL.

Limites : lecteurs d'écran, Safari, navigation RTL complète, gros projets Composer et endurance mémoire non vérifiés. L'audit automatisé ne vaut pas conformité WCAG exhaustive. Cette revue ne prétend pas terminer les formulaires DDL ou toutes les fonctions phpMyAdmin.
