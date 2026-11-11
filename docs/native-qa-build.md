# Compiler et vérifier le moteur WebAssembly

Ce parcours s’adresse aux développeurs du runtime. Pour utiliser ALWIS, prenez le paquet de la release : vous n’avez pas besoin de compiler PHP ou MariaDB. Pour modifier le C, les pilotes ou les options natives, il faut reconstruire et tester le nouveau moteur, sans reprendre un binaire historique.

## Environnement de référence

La reconstruction CI utilise Ubuntu 24.04 **Linux x86-64**, PHP **8.4.27** et Emscripten **6.0.6**. WSL Ubuntu sur un PC x86-64 convient pour ce parcours. Travaillez dans le système de fichiers Linux pour éviter le coût d’une grosse compilation dans `/mnt/c` ; gardez un clone dédié et de l’espace pour les sources, objets et archives.

La recette exacte et les dépendances sont dans le [workflow 02](../.github/workflows/native-rebuild-ci.yml). Il installe notamment les outils C/C++, CMake, Ninja, Bison, re2c, Autoconf/Automake, libtool et les dépendances de construction hôte. Ne remplacez pas les versions épinglées par « la dernière » si vous voulez reproduire les conditions du build.

## Préparer les sources vérifiées

Depuis la racine du clone Linux :

```sh
python3 scripts/prepare-independent-native-inputs.py --download --stage-root build-work
python3 scripts/prepare-php84-source.py --verify-only
```

Le préparateur vérifie sept archives amont avec leurs SHA-256 et construit un arbre jetable. Les verrous de provenance sont conservés dans `provenance/`. Une préparation réussie est une preuve de sources cohérentes, pas encore une preuve de WASM compilé.

## Installer l’outil épinglé et compiler

Sur un clone neuf sans SDK préparé, reprenez le bloc d’installation Emscripten du workflow. Il vérifie la révision emsdk `d7b4130688bfa348392b921ab04015aa15c4f154`, installe puis active `6.0.6` sous `build-work/emsdk`.

```sh
bash scripts/build-independent-native-ci.sh
```

Cette recette charge l’environnement Emscripten, vérifie sa version, construit les outils hôte MariaDB, PCRE2, PHP embarqué puis le runtime fusionné. Elle utilise un parallélisme borné. Une erreur ne doit jamais entraîner un remplacement silencieux par un vieux WASM.

Les résultats compilés se trouvent sous `build-work/bridge/.native-build/engine/wasm/runtime-dist/`. Les sources correspondantes et leurs reçus permettent de relier ce résultat aux archives amont et aux modifications ALWIS.

## Tester les octets réellement construits

Installez les dépendances Node et les navigateurs comme le fait [l’action partagée navigateur](../.github/actions/browser-tests/action.yml), puis utilisez la cible native :

```sh
export ALWIS_PARITY_RUNTIME_DIST=build-work/bridge/.native-build/engine/wasm/runtime-dist
export ALWIS_PARITY_LABEL=independent-candidate
node tests/browser/native-parity.mjs chromium,firefox
node tests/browser/native-curl.mjs chromium,firefox
python3 scripts/attest-independent-parity.py
node tests/browser/collab-native-php-peers.mjs chromium,firefox
node tests/browser/native-error-recovery.mjs chromium,firefox
node tests/browser/database-stability.mjs chromium,firefox
```

La validation complète ajoute le build de l’éditeur, la charge courte et la reprise :

```sh
npm ci
npm run editor:build
node tests/browser/load-native.mjs chromium,firefox
node tests/browser/restart-native.mjs chromium,firefox
```

Ne concluez pas à une parité uniquement parce que PHP affiche un texte. Il faut vérifier les sessions, corps binaires, transactions, limites, requêtes suivantes et compteurs de ressources. [Matrice de preuves](runtime-parity.md).

## Restaurer un build déjà validé

`scripts/restore_independent_native_qa.py` sélectionne un artefact CI autorisé par les verrous et l’identité des entrées natives. Il contrôle WASM, JavaScript, archives et reçus. Les sélections sont consignées sous `build-work/`. Les artefacts Actions expirent ; les sources et reçus de la release constituent la distribution durable.

Une compilation locale peut avoir un hash différent du runner : conservez son propre manifeste. L’exception de publication de la bêta n’est pas une approbation de toutes les versions futures ; le [contrôle de publication](../scripts/publication_policy.py) reste distinct des tests techniques.
