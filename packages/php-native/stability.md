# Consolidation PDO/MySQLi et cycle des projets

## Défaut reproduit et corrigé

Avec le moteur précédent, garder les objets de statements après fermeture de leur connexion MySQLi conservait leurs chunks `send_long_data` dans le budget global. Quatre connexions successives envoyant chacune 8 Mio échouaient avec « Long-data budget exceeded » alors que les connexions précédentes étaient fermées.

`close_connection` ferme désormais les handles et libère les chunks binaires possédés par chaque statement. La libération des références PHP liées reste gérée par les durées de vie normales des objets, pour ne pas déclencher des destructeurs utilisateur pendant ce nettoyage interne. La libération du budget ne signifie pas que le navigateur rend immédiatement sa mémoire physique au système.

## PDO et stabilité partagée

`database-stability.php` vérifie sur chaque requête :

- fermeture de quatre statements de 8 Mio en gardant leurs objets PHP vivants ;
- préparations PDO natives et émulées, erreurs de clé dupliquée et SQLSTATE ;
- maintien de la transaction après erreur de statement, commit et réutilisation de curseur ;
- Unicode, DECIMAL au-delà des entiers JavaScript et BLOB exacts ;
- rollback MySQLi et lecture cohérente depuis PDO.

Le parcours navigateur répète cette fixture sur douze requêtes et vérifie après chacune les compteurs de connexions, statements et SQL préparé : ils doivent revenir à zéro. Il enregistre l’allocateur C et la capacité linéaire ; ce scénario court et chargé ne constitue ni une mesure de PSS du navigateur ni une preuve d’endurance générale. Une capacité WASM ayant grandi ne rétrécit pas automatiquement.

## Expérience et optimisation

L’ouverture concurrente de deux projets est refusée avant création d’un second moteur. Une ouverture échouée nettoie son propriétaire sans sauvegarder un projet partiellement initialisé. Le parcours de l’atelier exerce ce verrou dans les deux navigateurs.

Un export ZIP de projet PHP pur reste sans démarrage MariaDB ni workers SQL ; les fichiers SQL persistés après un redémarrage restent inclus lorsqu’ils existent. Le parcours de l’atelier vérifie les deux cas.

La console SQL n’indexe plus tous les fichiers PHP/JavaScript à chaque montage de son éditeur. Elle utilise le catalogue SQL déjà disponible ; les services et l’index de fichiers restent destinés à l’éditeur de code.

## Reproduire et distribuer

```sh
node tests/browser/database-stability.mjs
node tests/browser/mysqli-complete.mjs
node tests/browser/php-essentials.mjs
node engine/native/build/test-native-runtime.mjs
node tests/browser/alwis-workbench.mjs
python3 scripts/manifest-native-build.py
```

Le générateur refuse les sources natives non commitées et les reçus absents, échoués ou portant un autre hash WASM. Il conserve les sources C et leurs en-têtes, la recette, les générateurs et la provenance des adaptations PDO. Le nouveau moteur est distribué via une release technique épinglée ; l’ancien reste disponible. La CI vérifie les sources et les empreintes avant restauration. Cette consolidation n’ajoute pas les six API MySQLi volontairement refusées et ne prétend pas terminer la conformité PDO/MySQLi.

## Build validé du 3 novembre 2026

Le moteur est épinglé sur la release technique [`native-runtime-2026-11-03-stability`](https://github.com/Bastian-Noel/ALWIS/releases/tag/native-runtime-2026-11-03-stability). Son WASM porte l’empreinte SHA-256 `80df46b7b308b33475fde138eb1a295c01ffbf6ac685d17a74209eb224674e0f`. La [CI de la source applicative `a47f701`](https://github.com/Bastian-Noel/ALWIS/actions/runs/41597218729) a réussi : le moteur restauré et le paquet statique ont été vérifiés dans Chromium et Firefox. Les reçus versionnés sont dans `engine/fusion/receipts/database-stability/`.

La distribution utilise uniquement `main` pour les sources et les releases pour les binaires ; aucune branche d’upload n’est nécessaire.
