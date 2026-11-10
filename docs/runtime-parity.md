# Parité du runtime PHP · Migration GPLv2

[Roadmap V1](https://github.com/Bastian-Noel/ALWIS/issues/1) · [Architecture](architecture.md) · [Licences et sources](../provenance/licensing-repair-progress.md)

## Runtime historique : référence en lecture seule

- **Révision de référence :** `bed7ca0ab47e155bf3ad9556c5abe4933f93e896` (ancienne compilation native).
- **WASM historique SHA-256 :** `80df46b7b308b33475fde138eb1a295c01ffbf6ac685d17a74209eb224674e0f`.
- **Fichier local :** `build-work/native-release/native-runtime-2026-11-03-stability/pbl-runtime.wasm` (s'il est disponible).
- **Restauration du témoin CI :** la release native épinglée a disparu de GitHub. Le ZIP public historique [v0.3.0-preview.18](https://github.com/Bastian-Noel/ALWIS/releases/tag/v0.3.0-preview.18) contient **les mêmes octets** WASM et JS. SHA-256 du ZIP : `971c2576748f0c19bb0231deaf5270a859818ba4b16515228b8d163dad88928d`. Le manifeste immuable `provenance/historical-native-artifact.json` est vérifié contre le verrou (`05987b9ba2b112ff0abbfc6ea05430add57ea9e5f83ab2f6dcd8024ad51ed304`).
- **Statut :** référence fonctionnelle **non redistribuable en tant que nouvelle release** : patch tiers ancien et source manquante.

Ne pas remplacer ce fichier par le nouveau runtime ni renommer l'ancien binaire pour le faire passer pour GPLv2.

Le script `scripts/restore-deployment-engine.py` vérifie **le ZIP entier, chaque binaire et les sources historiques** avant de copier les octets vers la cible de test. **Ce n'est pas une reconstruction GPLv2 ni une autorisation de publier.** Les workflows de publication conservent la vérification du statut des licences.

~~~sh
python3 -m unittest discover -s tests -p 'test_native_restore.py' -v
python3 scripts/restore-deployment-engine.py
~~~

Les tests de parité natifs et navigateur du successeur GPLv2 restent à effectuer.

## Matrice de comparaison

| Contrat | Scénario existant | Condition de parité |
| --- | --- | --- |
| PHP seul, démarrage SQL différé | `tests/browser/site-package.mjs` | Aucun thread SQL avant la première requête SQL |
| GET/POST, `$_SERVER`, sorties et code d'erreur | `tests/browser/php-essentials.mjs` | Même statut, variables, stdout/stderr et fin de requête |
| Téléversement multipart binaire | `tests/browser/php-essentials.mjs` | Corps inchangé, SHA-256 identique |
| PDO et MySQLi | `tests/browser/mysqli-complete.mjs` | 106 entrées et aucun curseur / statement fuyant |
| Cookies et sessions indépendantes | `tests/client-sessions.test.mjs` | Deux clients avec cookies distincts sur la même base |
| Transactions et durée de vie SQL | `tests/browser/database-stability.mjs` | Transactions / erreurs / récupération et compteurs sans fuite |
| HTTP externe, timeout, gzip, 16 Mio | `tests/browser/network-native.mjs` | Même hash binaire, mêmes limites d'annulation |
| Persistance après redémarrage | `tests/browser/disk-storage.mjs` | Aucune perte de fichiers ni d'état SQL |
| Invité → hôte, contrat HTTP | `tests/collab-http-contract.test.mjs` | Pas de DOM partagé, cookies hôte, limites et non-rejeu POST |
| Vrai aperçu invité bout en bout | **À ajouter** | Navigation et JavaScript locaux invités, requêtes PHP au navigateur hôte |

## Ordre d'exécution

1. Exécuter les mêmes fixtures sur le vieux WASM local et archiver les résultats avec son empreinte. Il sert de **témoin technique uniquement**.
2. Compiler un nouveau WASM Sean Morris + adaptateurs ALWIS et patch MariaDB indépendant.
3. Lancer Chromium puis Firefox avec chaque scénario, comparer les résultats déterministes et documenter les écarts.
4. Tester deux vrais navigateurs invités contre un hôte, puis coupure réseau et reconnexion.
5. Préparer les sources correspondantes du nouveau binaire. Garder le verrou de redistribution jusqu'à validation.

> Une source-only CI verte n'est pas un succès de parité : elle ne compile ni n'exécute PHP/MariaDB.
