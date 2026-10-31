# Interfaces du runtime

Le [studio](studio/README.md) implémente l'éditeur de fichiers, l'administration SQL et les fenêtres clientes autour d'un même propriétaire moteur. Le schéma lit les tables/relations réelles de MariaDB. Les reçus Chromium/Firefox sont sous `studio/receipts/`.

Une fenêtre référence un projet et une identité cliente ; N fenêtres peuvent partager cette identité, ou utiliser des sessions distinctes avec une même base. Les connexions SQL et leurs propriétaires restent distincts de ces identifiants.

Chaque outil évolue entre actif, en veille et déchargé. Le déchargement conserve son état dans IndexedDB ; la sauvegarde explicite conserve aussi l'état courant des outils. Le moteur sert les clients indépendamment du DOM des outils. La fermeture du studio arrête ce propriétaire : les fenêtres clientes ne deviennent pas des serveurs autonomes.

La compatibilité navigateur complète, la comparaison d'origines séparées et les gains de mémoire physiques restent ouverts. Voir les limites du guide du studio.

Orientation de l’éditeur : [CodeMirror 6, services WASM et définitions jQuery internes](../docs/EDITEUR-CODE.md). Ces composants sont demandés mais pas encore intégrés.
