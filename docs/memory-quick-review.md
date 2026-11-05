# Mémoire : examen rapide du 5 novembre 2026

Le signalement d’environ 800 Mo concerne la mémoire du navigateur, pas seulement les allocations de PHP/MariaDB.

## Observations

Un scénario réel Chromium/Firefox a ouvert un projet vide, démarré SQL, puis testé des modifications de cellules, des relations et des suppressions. Les relevés sont produits par `tests/browser/constraint-feedback.mjs`, dans `build-work/constraint-feedback/memory-*.json`.

- Capacité de la mémoire linéaire WebAssembly : **256 Mio**, avant et après démarrage de SQL.
- Allocations natives après les premières opérations SQL : environ **75 Mio**.
- Workers natifs après démarrage de SQL : **16**, dont 15 utilisés ; aucun avant son démarrage.
- Un relevé ponctuel du navigateur complet a atteint environ **1 038 Mio de PSS dans Chromium** et **938 Mio dans Firefox**. Ces valeurs comprennent navigateur, éditeur, services de langage, workers et moteur. Ce n’est ni la mémoire d’un seul onglet ni un benchmark avant/après.
- Les relevés ponctuels dépendent notamment du chargement des services de langage. Ils ne constituent pas une comparaison de versions permettant de conclure à un gain. La somme RSS peut compter plusieurs fois les pages partagées.

## Ce qui reste inchangé

Pas de réduction du pool de threads, de la mémoire initiale ou des buffers MariaDB : ces modifications exigent une reconstruction native et des tests de démarrage, concurrence, sauvegarde et restauration. Une valeur trop faible pourrait ralentir ou bloquer le moteur.

Les services de langage sont déjà chargés à la demande ; le moteur SQL démarre à la demande et les traces réseau sont bornées à 200 entrées avec 32 Kio de texte par corps. Aucun cache évident non borné n’a été identifié dans cet examen rapide.

## Pistes à mesurer séparément

1. Mesurer le navigateur avec et sans chaque service de langage pour attribuer le surcoût de l’éditeur.
2. Tester une capacité initiale WASM inférieure sur un moteur reconstruit, en tenant compte des piles, du démarrage SQL et de la croissance mémoire.
3. Réévaluer les piles et workers natifs avec des tests InnoDB représentatifs ; ne pas déduire du seul nombre de cœurs qu’on peut réduire les threads.
4. Évaluer un déchargement des services de langage après une longue inactivité, avec mesure de la latence de reprise.

Ces pistes n’ont pas été engagées dans ce correctif. **Aucune baisse de RAM n’est revendiquée.**

## Avertissement `madvise`

`madvise` est un conseil de gestion de mémoire destiné au système d’exploitation. Le moteur WASM épinglé signale que ce conseil n’est pas disponible. SQL continue à fonctionner. Seul le message exact `warning: unsupported syscall: __syscall_madvise` est comptabilisé dans `state().diagnostics.memoryAdviceWarnings` au lieu d’être imprimé comme erreur ; les autres sorties stderr sont conservées. Ce traitement ne simule pas une libération de mémoire et ne modifie pas le résultat de l’appel natif.
