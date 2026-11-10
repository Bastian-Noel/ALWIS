# ALWIS — moteur PHP 8.4 + MariaDB indépendant (développement)

**Moteur actif dans la recette de compilation :** `packages/php-native/src/runner.c`, écrit pour ALWIS. La cible `pbl-runtime` compile ce runner et `request-state.c` dans **un même WASM** avec PHP 8.4.27, le moteur MariaDB et les couches PDO/MySQLi natives.

**État vérifié le 10 novembre 2026 : source native compilée en WASM dans la CI Linux x86-64. La parité Chromium et Firefox reste incomplète.** Ce n'est pas le moteur de production et aucun script ici n'autorise sa publication.

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

Le script `scripts/prepare-independent-native-inputs.py` récupère uniquement les sept archives verrouillées et contrôle chaque SHA-256 **avant** extraction. Il reconstruit dans `build-work/native-ci` les sources PHP 8.4.27, Zend Fibers, MariaDB non patché et les unités PDO/MySQLi générées. L'archive JoomEngine manquante et son runner historique sont volontairement exclus.

La [CI de reconstruction](../../../.github/workflows/native-rebuild-ci.yml) se lance manuellement dans GitHub Actions avec le choix `sources` (vérification et reçus uniquement) ou `compile` (Emscripten 6.0.6 sur Linux x86-64 et tentative de lien du nouveau WASM). Le chemin de compilation est `scripts/build-independent-native-ci.sh`; il produit le candidat uniquement dans le workspace éphémère d'Actions et ne téléverse **jamais le WASM**. Les fichiers envoyés en artefacts Actions ne sont que des reçus de contrôle (et les logs restent consultables dans la CI).

`compile` ne signifie pas que la reconstruction a réussi : seuls une compilation complète avec nouveau SHA-256, les deux tests Chromium/Firefox et la suite de parité constituent une validation technique. Même une compilation réussie **ne lève aucun verrou de licences** et ne permet pas FTP/GHCR. L'archive de sources correspondantes reste une obligation distincte de la reconstruction.


### Dernier échec réellement observé, 10 novembre 2026

[Rebuild Linux x86-64 GitHub Actions](https://github.com/Bastian-Noel/ALWIS/actions/runs/42798390821) : le C/C++ du serveur MariaDB et l'archive PHP pthread se sont compilés ; le premier lien `pbl-runtime` a échoué sur `getdtablesize`, non exporté par la libc Emscripten 6.0.6. Le module ALWIS `packages/php-native/src/portability.c` fournit désormais un substitut faible borné par `sysconf(_SC_OPEN_MAX)`, avec test C natif ; **le lien natif indépendant a depuis été validé, mais pas les 17 tests de parité dans les deux navigateurs**. Aucun contournement `--allow-undefined` n'est utilisé.

Le paquet de sources correspondantes doit désormais inclure également la **tarball officielle PHP 8.4.27 réellement compilée** et l'archive **PCRE2 10.47 réellement liée** ; les cinq autres snapshots vérifiés ne suffisaient pas. La provenance correspondante est verrouillée dans les scripts de vérification et la carte des licences.


### Nouvelles preuves de reconstruction (10 novembre 2026)

La CI GitHub Actions 42803222230 a construit à partir de sources verrouillées un WASM indépendant de 38 242 083 octets, SHA-256 dedfcc6935697157d6bccae3ab597050bbbb89b5f6be9f28b3a946f8c83ed3c3. Les sept archives correspondantes étaient présentes et la validation navigateur a démarré. Version PHP, extensions et GET fonctionnaient dans Chromium. Le premier POST échouait car PHP 8.4 ne lit pas ses données lorsque SG(server_context) est nul. Le nouveau runner initialise ce contexte avant php_request_startup(), puis le libère après php_request_shutdown(). Le correctif a été validé en tests de source et intégré à la reconstruction 42844495555, dont les résultats doivent être consultés séparément.

Le binaire historique disponible sur le serveur ARM64 est un témoin de test et non une compilation indépendante. Aucun nouveau WASM n'est publié. La présence d'une archive de sources correspondantes ou de tests réussis ne change pas le statut légal bloqué.


### Validation de parité indépendante passée

La CI GitHub Actions 42844495555 a terminé **avec succès** la compilation, l'archive de sources, puis les 17 scénarios natifs **dans Chromium et Firefox**. Nouveau WASM SHA-256 : 39f4b5d6cf785adafd5f994d11b88b491b7dcc21dbfedbefe896b871f5f4f6b6 ; longueur : 38 242 096 octets ; sources correspondantes : 254 740 830 octets. Les scénarios incluent PHP 8.4, GET, POST, POST binaire, statuts et redirections, cookies, sessions PHP, fichiers, PDO, MySQLi, nettoyage des connexions et erreur PHP.

Les reçus 42844495555 existaient déjà mais le build JSON conservait browserValidated=false, car le marquage précédait l'exécution des navigateurs. Le nouveau script de vérification scripts/attest-independent-parity.py n'actualise ce champ qu'en confrontant les empreintes exactes du WASM et de sa glue JS aux **deux** reçus, les 17 cas dans le bon ordre et l'absence de connexions natives résiduelles. Il laisse releaseApproved=false. Cette étape a été ajoutée à la CI de reconstruction ; elle ne publie aucun binaire.
