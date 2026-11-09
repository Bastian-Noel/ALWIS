# Tests de bout en bout du mode multi-utilisateur (optionnels)

Deux onglets Chromium (hôte + invité) contre `server/server.mjs`, avec un faux moteur en mémoire (`fake-services.mjs`)
à la place de PHP/MariaDB. Nécessite Python, `pip install playwright` et `playwright install chromium`.
Ces scripts ne font pas partie de `npm test`. Le serveur doit servir le site sur le port 8101 (voir `harness.py`).
