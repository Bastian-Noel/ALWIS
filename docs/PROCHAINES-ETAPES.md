# Ordre de réalisation actif

Instruction utilisateur : terminer d'abord PHP pour les projets simples et consolider PDO/MySQLi, ensuite réaliser le vrai éditeur de site, enfin terminer l'administration SQL. Cet ordre remplace celui du bilan qui plaçait la diffusion avant ces fonctionnalités. La publication ne doit pas interrompre ce travail lorsque le service d'hébergement est inaccessible.

## 1. PHP et accès SQL

Premier lot PHP : filter, ctype, tokenizer, fileinfo, mbstring et iconv, avec preuves de validation, Unicode, types MIME et encodages. Le sous-module mbregex dépend d'Oniguruma et n'est pas promis par l'activation de mbstring sans cette dépendance.

**Premier lot livré :** ces six extensions, types numériques PDO avec stringify et conservation des valeurs exactes, savepoints MySQLi procéduraux/objet. Preuves et limites : [PHP essentiel](../engine/fusion/PHP-ESSENTIALS-RECEIPT.md). Les lignes suivantes restent le travail à poursuivre ; ce lot ne clôt pas toute la phase 1.

Compléter ensuite les besoins de fichiers et documents (zlib/ZIP, DOM/XML/SimpleXML) avec dépendances épinglées. Décider des ajouts crypto/images selon les projets de référence. Conserver les sources, recettes et témoins précédents ; mesurer le coût des extensions avant de définir d'autres profils.

PDO : types, ATTR_STRINGIFY_FETCHES, paramètres/références, LOB, attributs, erreurs, curseurs et résultats multiples. MySQLi : options, diagnostics, savepoints, attributs/long-data, real_query/store_result/use_result, multi_query/next_result et variantes objet/procédurales. Les API hors contexte du serveur embarqué doivent avoir une politique explicite, sans fausse réussite.

Sortie : petits projets PHP CRUD/authentification/upload importés sans réécrire PDO/MySQLi ; erreurs récupérables, transactions, valeurs exactes, quotas et nettoyage prouvés. Alterner fonctionnalités et validations ciblées, sans répéter les compilations amont sans nécessité.

## 2. Vrai éditeur de site

CodeMirror 6, explorateur et opérations de fichiers, recherche/remplacement, documents PHP/HTML/CSS/JS, sauvegarde/brouillons et protection des binaires. Puis services WASM PHP/HTML/JS et définitions jQuery virtuelles invisibles selon EDITEUR-CODE.md. Services déchargeables et mémoire mesurée. Appliquer les skills d'interface demandés, anti-ai-slop en priorité.

## 3. Administration SQL complète

Finaliser console et résultats multiples, recherche/tri/filtres, formulaires de tables/colonnes/index/contraintes, schéma, imports/dumps usuels et sauvegarde complète. Garder les contrôles de concurrence, types exacts, erreurs utiles et budgets ; valider sur un vrai projet avec les outils déjà livrés.

Le bilan du 1 novembre reste une photographie des capacités ; ce fichier définit l'ordre de travail suivant, pas une déclaration de fonctionnalités terminées.
