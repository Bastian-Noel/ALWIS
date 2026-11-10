# ALWIS — reconstruction du runner PHP 8.4 natif

**Statut (10 novembre 2026) : première implémentation source indépendante, non liée au WASM.** Ne pas traiter ces sources ni le test de syntaxe comme une réussite PHP/MariaDB en navigateur.

## Origines et indépendance

- Témoin historique : `joomengine/php-wasm@3b8cef42c020fbcbb6b41fad86716b7c8664b55b`, `native/runtime.c` absent. Sa sauvegarde exacte n'a pas été retrouvée ; l'ancien WASM sert uniquement d'oracle de comportement, sans réutilisation de son binaire dans une release GPLv2.
- Base ouverte : `seanmorris/php-wasm@1e1fb6703730759181e84c62bce35ee9129febb9`, archive SHA-256 épinglée dans `provenance/php-wasm-source-recovery.json`. Son API d'exécution `pib_init` / `pib_run` est une référence d'architecture et n'est pas compatible directement avec ALWIS. Le dépôt Sean Morris est doublement licencié Apache-2.0/GPL-2.0 pour les parties couvertes ; **cela n'octroie pas cette option aux ajouts JoomEngine non retrouvés**.
- Candidat ALWIS : `packages/php-native/src/runner.c` et `request-state.[ch]`. Il utilise les points d'entrée documentés de PHP 8.4 (SAPI, `php_request_startup`, `php_execute_script`, `php_request_shutdown`) sans copier le runner JoomEngine indisponible. Les callbacks Emscripten se limitent à la transmission des variables serveur, des corps binaires, de stdout/stderr et des en-têtes. Le moteur SQL et les appels PDO/MySQLi restent dans le même WASM.

## Interface de première intention

| ABI actuelle ALWIS | Adaptateur source proposé | Vérification encore nécessaire |
|---|---|---|
| `php_wasm_run` | Initialise PHP à la première requête, alimente la SAPI, exécute un fichier, termine la requête | Link PHP 8.4.27/ZTS puis GET/POST/cookies/session en navigateur |
| `php_wasm_exit_code` | Mémorise la sortie de la dernière requête | Exceptions PHP, fatal, `exit()`, statut HTTP réel |
| `php_wasm_abi_version` / `php_wasm_version` | Exports natifs provisoires versionnés | Inspecter l'ABI produit après lien |
| `php_wasm_add_server_variable` / `php_wasm_setenv` | Valeurs limitées et temporaires, pas de fuite volontaire entre sessions | Tester l'ordre, les doublons, la compatibilité avec le worker |
| `pbl_mysql_owner_begin` / `_cleanup` | Démarre un propriétaire par requête, nettoie après les destructeurs PHP | Prepared PDO/MySQLi, rollback, exceptions, concurrence |
| Corps/headers/stdout | `request-state.c`, limite 8 Mio et lecture progressive | Multipart, gros flux, erreurs, réponse binaire et timeout |

Le nouveau fichier `runner.c` est **une hypothèse d'intégration**, pas un fork compilé de PHP. Les raccords précis à la SAPI, au thread principal et au module PHP SQL restent à vérifier en compilation Emscripten 6.0.6, puis par les 17 scénarios de la matrice historique et les suites existantes.

## Reproduction sans remplacer le témoin

Le chemin historique reste la valeur par défaut de `scripts/prepare-native-drivers.py`. Seul le chemin `--independent-runner`, activé par `scripts/build-independent-native.sh`, remplace la source générée `runtime.c` par le runner ALWIS. La recette native ajoute alors `request-state.c` à la cible CMake. Les hachages originaux/générés sont enregistrés dans `driver-adapter.json`.

```bash
# Préparation de source, possible sans JoomEngine ni compilateur WASM :
python3 scripts/prepare-native-drivers.py /chemin/vers/ancien-wrapper-inexistant \
  /chemin/vers/php-8.4.27 /chemin/vers/sortie --independent-runner

# Garde-fous indépendants (exécute un vrai binaire C portable) :
python3 -m unittest discover -s tests -p 'test_independent_php_runner.py' -v

# Puis seulement après préparation de la toolchain + MariaDB épinglés :
PBL_TARGET=pbl-runtime JOBS=3 bash scripts/build-independent-native.sh
```

Le contrôle local de syntaxe C du runner a été effectué en utilisant des **en-têtes PHP 8.4.27 officiels empaquetés pour le système hôte et une déclaration factice d'EM_JS**. Cette étape ne compile pas les callbacks JavaScript, n'émet pas de WASM et ne teste pas la liaison. Le code de comptage HTTP, lui, a été réellement compilé et exécuté sous GCC (`-Wall -Wextra -Werror`). Les prérequis du build réel (PHP Zend ZTS, Emscripten, MariaDB épinglé) doivent encore être assemblés dans un environnement compatible.

## Risques ouverts avant validation

1. SAPI PHP : exactitude de l'ordre des fonctions startup/shutdown, cookies, sorties fatales, `HEAD`, état des superglobales et erreurs après une initialisation partielle.
2. Thread et mémoire : vérification en build ZTS de l'ABI `EM_JS`, d'Asyncify, du chargement lazy des workers SQL et de la gestion des buffers.
3. SQL : test d'intégrité des connexions MySQLi et préparations PDO, transactions abandonnées, InnoDB/checkpoints sous charge et reprise de la base.
4. API : compatibilité de tous les exports natifs, détails d'en-têtes et codes d'erreurs, fuite de variables d'environnement entre clients.
5. Provenance : empaquetage du code exact finalement lié, revue des autres modifications Sean Morris/JoomEngine, licences et notices.

**Garde-fou publication :** l'absence de JoomEngine `native/runtime.c` n'est plus une raison de bloquer la *préparation des sources indépendantes*, mais les contrôles `newRuntimeCompiled`, `newRuntimeBrowserValidated`, `newNativeLicenseAndSourceBundle` et revue légale restent obligatoirement bloquants.
