# Import des archives et conservation des preuves

## Provenance

Import du 31 octobre 2026 depuis `preparation.zip`, `sources.zip` et le texte complémentaire fourni dans ce chat. Le manifeste [`import-manifest.json`](../provenance/import-manifest.json) contient les tailles et SHA-256 des ZIP et de toutes leurs entrées ainsi que du complément. Les trois manifestes communs aux deux ZIP ont été comparés : ils sont identiques.

Le préfixe d'emballage `php-browser-lab/` est retiré : le projet est installé à la racine de WASMWebServer. Le nom npm `php-browser-lab` est conservé pour la continuité.

## Stockage des sources

Le ZIP initial contient 19 archives `.tar.gz` totalisant environ 500 Mo. Deux dépassent 100 Mo. Les stocker comme fichiers Git ordinaires empêcherait l'envoi sur GitHub. La release privée `sources-2026-10-31` conserve un ZIP contenant les mêmes 19 archives, sans modification de leurs octets.

Le workflow `Archive pinned source snapshots` récupère les snapshots aux commits des verrous, contrôle leur taille et leur SHA-256, puis publie `sources.zip` et `SHA256SUMS`. Il échoue si les octets diffèrent. Le ZIP est reconditionné pour une extraction à la racine : **son hash diffère du ZIP téléchargé initialement**, mais les archives amont ont les empreintes originales. Aucun code amont n'est compilé ou exécuté par ce workflow.

Restaurer le ZIP depuis la release, vérifier `SHA256SUMS` et l'extraire comme indiqué dans le README. Autre voie : lancer directement les scripts de téléchargement épinglés. Les archives restaurées permettent ensuite l'extraction hors ligne des snapshots ; elles ne fournissent pas la chaîne de compilation ni les paquets npm du build.

## Modifications éditoriales et techniques

- README et guide de restauration adaptés au dépôt GitHub et à la release.
- Ajout de CONTEXTE, DECISIONS et de ce guide ; conservation intégrale des deux traces de conversation.
- Guide REPRISE actualisé pour la disposition à la racine et les deux sources de contexte.
- Correction de `staging.mkdir()` en `staging.mkdir(parents=True)` dans `fetch-upstream.py` : une restauration depuis un clone neuf échouait sans dossier `upstream/`.
- Packaging : exclusion de `.git`, des sorties et des archives locales pour éviter une récursion ou l'inclusion de l'historique du dépôt.
- Ajout d'un outil de regroupement des sources, des règles Git et de deux workflows de vérification/archivage.

Les autres fichiers de préparation sont conservés, y compris les rapports de l'environnement et des tests de reconstruction. Leurs dates/chemins décrivent l'ancien environnement. Les nouvelles validations sont consignées séparément dans `provenance/import-validation.json`.

## Vérification après restauration

```bash
npm test
python3 scripts/fetch-upstream.py
python3 scripts/fetch-native-deps.py
python3 scripts/verify-project.py
```

Le dernier contrôle vérifie les archives, les 81 repères, les tests Node et la syntaxe du contrat C si un compilateur est disponible. Il ne lance pas PHP/MariaDB, MySQLi, OPFS ou le routage navigateur. `map-upstream.py` ne doit être relancé que si l'on souhaite régénérer la cartographie ; ce n'est pas un prérequis pour lire celle qui est livrée.
