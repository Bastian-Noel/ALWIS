# ALWIS — moteur PHP 8.4 + MariaDB indépendant (développement)

**Moteur actif dans la recette de compilation :** `packages/php-native/src/runner.c`, écrit pour ALWIS. La cible `pbl-runtime` compile ce runner et `request-state.c` dans **un même WASM** avec PHP 8.4.27, le moteur MariaDB et les couches PDO/MySQLi natives.

**État : source préparée, pas encore compilée en WASM ni validée dans un navigateur.** Ce n'est pas le moteur de production et aucun script ici n'autorise sa publication.

## Compilation du candidat

Le moteur historique a été archivé et retiré des anciens répertoires de sortie de compilation locaux. Le générateur `scripts/prepare-native-drivers.py` accepte uniquement `PHP_BUILD OUTPUT` et ne peut plus sélectionner `native/runtime.c` de JoomEngine. Le serveur MariaDB refuse également sa variante historique patchée avec l'API `l4m_session_*`.

Les entrées suivantes doivent être préparées dans `build-work/` depuis leurs archives à révisions/empreintes verrouillées : le source PHP 8.4.27 est maintenant préparé par `python3 scripts/prepare-php84-source.py` (patch Zend fibers dérivé de Sean Morris sous option GPLv2). Il doit ensuite produire un `build-work/php-minimal/.libs/libphp.a` pour la cible pthread, `build-work/mariadb-shallow` non patché, les outils hôtes `build-work/bridge/.native-build/engine/native/import_executables.cmake`, ainsi qu'**Emscripten 6.0.6**. Ne jamais utiliser une archive PHP ou MariaDB non vérifiée.

```sh
# Vérification des composants C indépendants (ne compile pas le WASM)
python3 -m unittest discover -s tests -p 'test_independent_php_runner.py' -v
python3 -m unittest discover -s tests -p 'test_native_concurrency.py' -v
python3 scripts/prepare-php84-source.py --verify-only
python3 scripts/audit-native-inputs.py

# Build natif uniquement après mise en place des prérequis Emscripten
PBL_TARGET=pbl-runtime JOBS=3 bash scripts/build-independent-native.sh
```

Le constructeur refuse un arbre MariaDB porteur du patch historique. La cible émet le WASM et le JS sous `build-work/bridge/.native-build/engine/wasm/runtime-dist/`. L'absence de ces fichiers correspond désormais à **aucun nouveau runtime disponible** ; ne jamais y recopier l'ancien pour simuler une compilation.

## Tests et gates

Après compilation, exécuter les tests PHP/SQL/HTTP, les tests des préparations PDO/MySQLi, les sessions concurrentes et les tests de parité sur **Chromium et Firefox**. La comparaison avec le témoin historique utilise les 17 scénarios de `tests/browser/native-parity.mjs` ; elle exige deux hash WASM différents.

Le paquet des sources correspondantes est préparé par `scripts/package-native-sources.py --strict`. Il inclut le code C d'ALWIS, les sources générées vérifiées et les archives amont verrouillées, **sans** le runner historique absent. La publication reste bloquée par `provenance/release-licensing-status.json` tant que les tests, licences et manifestes ne sont pas approuvés.

## Archives et références

- Archive de travail : `build-work/archives/legacy-native-2026-11-03-stability.tar.gz`, vérifiable par `python3 scripts/archive-legacy-native.py --verify-only`.
- Configuration `config/native-runtime.json` : **verrou de témoin historique**, pas une configuration du nouveau runner. Les tests et la production existante ne sont pas modifiés.
- [Reconstruction du runner](../../../provenance/php-runner-reconstruction.md), [inspirations et décisions JoomEngine](../../../provenance/joomengine-inspiration-map.md), [analyse des adaptations InnoDB](../../patches/INDEPENDENT-SESSION-MIGRATION.md).
- [Anciennes notes de compilation, archivées](../../../provenance/legacy-native-build-notes.md).


## Reconstruction indépendante sur GitHub Actions (Linux x86-64)

Le script \`scripts/prepare-independent-native-inputs.py\` récupère uniquement les cinq archives verrouillées et contrôle chaque SHA-256 **avant** extraction. Il reconstruit dans \`build-work/native-ci\` les sources PHP 8.4.27, Zend Fibers, MariaDB non patché et les unités PDO/MySQLi générées. L'archive JoomEngine manquante et son runner historique sont volontairement exclus.

La [CI de reconstruction](../../../.github/workflows/native-rebuild-ci.yml) se lance manuellement dans GitHub Actions avec le choix \`sources\` (vérification et reçus uniquement) ou \`compile\` (Emscripten 6.0.6 sur Linux x86-64 et tentative de lien du nouveau WASM). Le chemin de compilation est \`scripts/build-independent-native-ci.sh\`; il produit le candidat uniquement dans le workspace éphémère d'Actions et ne téléverse **jamais le WASM**. Les fichiers envoyés en artefacts Actions ne sont que des reçus de contrôle (et les logs restent consultables dans la CI).

\`compile\` ne signifie pas que la reconstruction a réussi : seuls une compilation complète avec nouveau SHA-256, les deux tests Chromium/Firefox et la suite de parité constituent une validation technique. Même une compilation réussie **ne lève aucun verrou de licences** et ne permet pas FTP/GHCR. L'archive de sources correspondantes reste une obligation distincte de la reconstruction.
