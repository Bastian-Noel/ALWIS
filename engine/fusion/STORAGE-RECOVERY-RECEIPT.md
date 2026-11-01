# Snapshots et récupération — 1 novembre 2026

Les nouveaux projets utilisent un montage IDBFS unique `atomic-v2` : fichiers, données SQL et point de sauvegarde des sessions clientes sont enregistrés ensemble après arrêt propre de MariaDB. Les scénarios ci-dessous passent sur Chromium et Firefox ; les JSON natifs et les reçus de redémarrage conservent les observations.

## Garanties exécutées

- Sauvegarde, nouveau Worker/nouvelle instance WASM, puis restauration des fichiers et de SQL.
- Vraie erreur IndexedDB `ConstraintError` **après une écriture réussie** dans la transaction : son abandon retrouve le dernier snapshot fichiers/SQL/métadonnées, sans mélange.
- Même échec suivi d'un réessai de sauvegarde : le nouvel état complet est retrouvé dans une nouvelle instance.
- Un fichier modifié avec un mtime volontairement inchangé est persisté : le suivi de mutations ne dépend pas uniquement des timestamps du SDK et ne falsifie pas les dates de fichiers stockées.
- Redémarrage complet du navigateur avec le même profil, puis SIGKILL du seul navigateur de test après mutations de fichiers et COMMIT SQL non sauvegardés : le dernier snapshot explicite est retrouvé.
- Un ancien magasin `FILE_DATA` au format Emscripten 6.0.6 reste lisible ; SQL est enregistré puis rouvert via le mode de compatibilité `legacy-split`. Ce mode garde ses deux magasins et n'acquiert pas rétroactivement l'atomicité du nouveau format. Les quotas continuent de s'appliquer ; les anciens magasins trop volumineux ne sont pas supprimés.
- Le studio draine les requêtes/cookies déjà acceptés avant de figer le snapshot de sessions. Son parcours N fenêtres/sessions, outils, export/restauration SQL reste exécuté sur les deux navigateurs.

## Deux défauts corrigés, un chemin retiré

Le SDK Emscripten 6.0.6 appelle `mount.syncfs()` depuis `fd_sync`. Un simple `fsync()` de fichier temporaire pouvait donc publier son état avant le rename, voire publier une base encore vivante. L'adaptateur de montage réserve maintenant la persistance au point de sauvegarde explicite ; `fsync` conserve sa portée virtuelle. Un COMMIT ou fsync ne constitue pas une sauvegarde navigateur.

Le gestionnaire d'erreur IDBFS utilise `preventDefault()`, ce qui peut empêcher l'abandon par défaut d'une transaction après un échec de requête. L'adaptateur abandonne explicitement la transaction et termine le callback une seule fois, y compris lorsque `transaction.error` est nul après un abort explicite. Les transactions d'écriture demandent la durabilité `strict` au navigateur.

Le redémarrage MariaDB dans le **même WASM** a provoqué un `abort` pendant le scénario d'échec de synchronisation. Le log est conservé sous `benchmarks/receipts/failures/`. Ce chemin n'est plus proposé dans l'interface : après arrêt, les adaptateurs C PDO/MySQLi/console renvoient une erreur claire au lieu de rappeler `mysql_server_init`. PHP sans SQL reste utilisable. Le studio crée une nouvelle instance après sauvegarde. Une initialisation SQL échouée refuse aussi les nouvelles tentatives et la publication de son état partiel.

Les phases natives exposées sont `dormant`, `running`, `stopped`, `failed`. Les tableaux de compatibilité ne doivent pas présenter l'arrêt/redémarrage à chaud comme une optimisation retenue.

## Limites

Il ne s'agit pas d'une preuve de résistance à une coupure physique du système ou à une panne matérielle du stockage. `strict` est une demande au navigateur. L'échec injecté est réel au niveau IndexedDB, mais ne remplit pas physiquement le disque. Le test SIGKILL coupe le navigateur avant un nouveau snapshot, pas pendant chaque instruction d'un commit.

Après échec de sauvegarde, le studio refuse les nouvelles requêtes clientes jusqu'au réessai ; les données restent en mémoire. La reprise SQL se fait via une nouvelle instance après sauvegarde réussie. La récupération d'un moteur ayant échoué pendant son tout premier démarrage, les limites de disque InnoDB et une migration automatique de l'ancien format restent à approfondir.

Les reçus mémoire à 256 Mio concernent la capacité linéaire sur leurs scénarios, pas une limite globale de RAM navigateur.

## Reproduction

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node engine/fusion/spike/test-native-runtime.mjs
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/restart-native.mjs
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/studio.mjs
```

Pour diagnostiquer seulement le stockage, `test-native-runtime.mjs chromium,firefox --storage-only` écrit des reçus séparés, sans remplacer les preuves du parcours natif complet. Le worker d'injection est réservé aux tests et n'est pas servi par le serveur de développement du studio.
