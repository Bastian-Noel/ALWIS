# Interfaces prévues

Trois responsabilités indépendantes : éditeur de fichiers, administration SQL et clients web. Un hôte moteur léger coordonne les ressources ; sa durée de vie ne dépend pas de celle d'un éditeur lourd.

Une fenêtre référence un `projectId`, un `runtimeId`, un `clientSessionId` et son propre `windowId`. N fenêtres peuvent partager une session ; plusieurs sessions peuvent utiliser le même runtime. Les connexions SQL et leurs propriétaires restent distincts de ces identifiants.

Chaque outil évoluera entre actif, en veille et déchargé. Le déchargement exige une sauvegarde réussie de l'état utile et une restauration testée. L'implémentation UI commence après validation du moteur.
