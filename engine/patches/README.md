# Adaptations natives ALWIS

Le patch amont `independent-sessions.patch` demeure présent dans l'ancien
artefact natif épinglé et son statut juridique reste bloquant pour la
distribution du binaire existant.

Le nouveau candidat de remplacement est décrit dans
[INDEPENDENT-SESSION-MIGRATION.md](INDEPENDENT-SESSION-MIGRATION.md).
Il est produit par `scripts/prepare-native-concurrency.py` **uniquement sur une
copie jetable du source MariaDB non modifié**, et la version actuelle n'a pas
encore passé la recompilation WASM ni les tests de stabilité en navigateur.

Pour réaliser une reconstruction expérimentale, préparer d'abord les sources
exactes propres et les outils Emscripten 6.0.6, puis utiliser :
```sh
PBL_INDEPENDENT_NATIVE=1 PBL_TARGET=pbl-runtime JOBS=3 bash engine/native/build/build.sh
```

Ne pas activer ce candidat en production, remplacer les archives natives ou
lever le blocage de licences sans les validations listées dans le rapport.
