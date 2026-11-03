# Restaurer les sources

Pour lancer le projet, suivez le [guide de développement](CONTRIBUTING.md#2-lancer-le-projet). Cette page concerne les archives de sources du moteur.

Le ZIP de la release s'extrait à la racine du dépôt : il remplit `sources/`. Les scripts `fetch-upstream.py` puis `fetch-native-deps.py` vérifient les empreintes et extraient dans `upstream/`. En l'absence d'archives locales, ils téléchargent les mêmes snapshots épinglés.

19 archives : 17 dépôts principaux et 2 sous-modules MariaDB. Aucun SDK ni `node_modules` fourni.
