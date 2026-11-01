# Ordre de réalisation actif

Instruction utilisateur : terminer d'abord PHP pour les projets simples et consolider PDO/MySQLi, ensuite réaliser le vrai éditeur de site, enfin terminer l'administration SQL. Cet ordre remplace celui du bilan qui plaçait la diffusion avant ces fonctionnalités. La publication ne doit pas interrompre ce travail lorsque le service d'hébergement est inaccessible.

## 1. PHP et accès SQL

Premier lot PHP : filter, ctype, tokenizer, fileinfo, mbstring et iconv, avec preuves de validation, Unicode, types MIME et encodages. Le sous-module mbregex dépend d'Oniguruma et n'est pas promis par l'activation de mbstring sans cette dépendance.

**Surface procédurale complétée :** [106 fonctions enregistrées avec politiques explicites et limites](../engine/fusion/MYSQLI-106-RECEIPT.md).

**Premier lot livré :** ces six extensions, types numériques PDO avec stringify et conservation des valeurs exactes, savepoints MySQLi procéduraux/objet. Preuves et limites : [PHP essentiel](../engine/fusion/PHP-ESSENTIALS-RECEIPT.md). Les lignes suivantes restent le travail à poursuivre ; ce lot ne clôt pas toute la phase 1.

Compléter ensuite les besoins de fichiers et documents (zlib/ZIP, DOM/XML/SimpleXML) avec dépendances épinglées. Décider des ajouts crypto/images selon les projets de référence. Conserver les sources, recettes et témoins précédents ; mesurer le coût des extensions avant de définir d'autres profils.

Approfondir la conformité PDO : variantes de types/attributs, LOB en flux, curseurs et résultats multiples. MySQLi dispose des nouveaux chemins options/diagnostics/long-data/résultats multiples ; approfondir leurs variantes, les classes/propriétés et les anciens alias objet. Les API hors contexte du serveur embarqué doivent avoir une politique explicite, sans fausse réussite.

Sortie : petits projets PHP CRUD/authentification/upload importés sans réécrire PDO/MySQLi ; erreurs récupérables, transactions, valeurs exactes, quotas et nettoyage prouvés. Alterner fonctionnalités et validations ciblées, sans répéter les compilations amont sans nécessité.

## 2. Vrai éditeur de site

**Lot livré :** CodeMirror, arborescence et opérations de fichiers, recherche/remplacement, services PHP/HTML/SWC, déclarations jQuery internes, cycle de vie et protections des écritures. [Fonctions et limites actuelles](../apps/studio/editor/README.md).

Approfondir les diagnostics PHP sémantiques, le contexte Composer, les documents mixtes, les opérations sur dossiers et l’endurance des services ; compléter les vérifications lecteurs d’écran et Safari.

## 3. Administration SQL complète

**Lot livré :** CodeMirror MySQL, sélection/scripts, résultats multiples, historique, catalogue réel pour la complétion et import DELIMITER/routines. Les formulaires DDL et la parité phpMyAdmin restent ouverts.

Finaliser console et résultats multiples, recherche/tri/filtres, formulaires de tables/colonnes/index/contraintes, schéma, imports/dumps usuels et sauvegarde complète. Garder les contrôles de concurrence, types exacts, erreurs utiles et budgets ; valider sur un vrai projet avec les outils déjà livrés.

Le bilan du 1 novembre reste une photographie des capacités ; ce fichier définit l'ordre de travail suivant, pas une déclaration de fonctionnalités terminées.
