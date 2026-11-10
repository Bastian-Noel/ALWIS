# Référence native ALWIS — matrice de parité PHP 8.4 / MariaDB

**Statut : scénarios codés, validation navigateur comparative à réaliser.** Les tests de structure Node et la vérification syntaxique PHP ne sont pas un résultat de parité WASM.

## Témoin et périmètre

- **Historique, test uniquement** : `config/native-runtime.json` verrouille le témoin (`native-runtime-2026-11-03-stability`). `scripts/restore-deployment-engine.py` doit vérifier le SHA-256 exact et les sources historiques avant le test. Le témoin n'est pas un nouveau runtime GPLv2 ni une autorisation de publication.
- **Candidat** : binaire compilé indépendamment sur la base Sean Morris GPLv2 vérifiée, PHP 8.4.27, MariaDB et les adaptateurs ALWIS. Les sources liées au binaire restent à documenter, et le candidat n'est pas encore validé.
- **Même scénario, deux binaires** : `fixtures/compatibility/native-parity.php` est exécuté sans modification dans chacun des runtimes par `tests/browser/native-parity.mjs`, et les reçus incluent les SHA-256 du WASM et du module JS exécutés.
- **Pas de changement d'architecture SQL ni obligation d'entiers 64 bits** pendant cette phase. La taille d'entier PHP est enregistrée sans servir de critère de parité.

| Étape | Sonde | Vérification | Historique | Candidat |
|---|---|---|---|---|
| 0 | environment | PHP 8.4, PDO/MySQLi, sessions, largeur d'entiers tracée | À exécuter | À exécuter |
| 1 | get | GET, encodage UTF-8, variables serveur et en-tête personnalisé | À exécuter | À exécuter |
| 2 | post | POST formulaire et corps brut, empreinte SHA-256 | À exécuter | À exécuter |
| 3 | binary | Corps POST avec octets `00`, `80`, `FF` | À exécuter | À exécuter |
| 4–5 | headers / redirect | Statut 201, en-têtes et redirection 302 | À exécuter | À exécuter |
| 6–7 | cookie (2 appels) | Set-Cookie, lecture du cookie renvoyé | À exécuter | À exécuter |
| 8–10 | session (3 appels) | Session initiale, réutilisation, isolation d'un second visiteur | À exécuter | À exécuter |
| 11–12 | file-write / file-read | Écriture binaire, relecture à la requête suivante et nettoyage | À exécuter | À exécuter |
| 13 | pdo | Prepared native, UTF-8, BLOB, commit et rollback InnoDB | À exécuter | À exécuter |
| 14 | mysqli | Prepared MySQLi, mêmes données SQL, transaction annulée | À exécuter | À exécuter |
| 15 | sql-cleanup | Suppression de la table dans le projet de test | À exécuter | À exécuter |
| 16 | error | Exception PHP visible et statut / code d'échec non trompeur | À exécuter | À exécuter |

## Exécution reproductible

Après la restauration **vérifiée** du témoin historique, installer les dépendances de navigateur décrites dans `tests/browser/README.md`, puis exécuter :

```sh
ALWIS_PARITY_LABEL=historical node tests/browser/native-parity.mjs chromium,firefox
ALWIS_PARITY_LABEL=candidate ALWIS_PARITY_RUNTIME_DIST=/chemin/absolu/vers/runtime-dist node tests/browser/native-parity.mjs chromium,firefox
node scripts/native-parity-report.mjs build-work/parity/historical-chromium.json build-work/parity/candidate-chromium.json
node scripts/native-parity-report.mjs build-work/parity/historical-firefox.json build-work/parity/candidate-firefox.json
```

Chaque navigateur utilise un **nouveau runtime jetable et local**. La fixture SQL détruit seulement sa table de test `alwis_parity_probe` dans cette instance ; **ne pas la lancer sur un projet utilisateur**. Aucune des commandes ci-dessus ne publie de release ou ne déploie de production.

Le comparateur refuse les scénarios manquants, réordonnés, les différences de comportement et un candidat dont le WASM est identique au témoin. Il neutralise uniquement les valeurs de session générées et la version corrective PHP, tout en conservant une trace de la largeur d'entiers hors périmètre. Les en-têtes `Set-Cookie` sont expurgés dans les reçus.

## Garde-fous qui restent nécessaires

La réussite de cette matrice ne remplace pas les tests complets de `tests/browser` : Chromium/Firefox sur l'artefact final, MariaDB multi-session, threads/locks/checkpoints, absence de fuite native, rechargement après sauvegarde et panne, HTTP/cURL, tests de collaboration réelle sur deux invités, sécurité de l'origine de prévisualisation et conformité GPLv2 avec sources correspondantes. FTP, GHCR et releases sont bloqués jusque-là.
