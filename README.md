# WASMWebServer

> **Runtime custom C disponible et testé sur Chromium/Firefox** : PHP/MariaDB communs, PDO/MySQLi natifs, fichiers, CGI/HTTP et sauvegarde/restauration. Voir [le receipt actuel](engine/fusion/NATIVE-RUNTIME-RECEIPT.md) pour les preuves et les limites ; les sections historiques ci-dessous décrivent la préparation initiale.

> Cadrage actualisé : voir [l’objectif actif](docs/EXECUTION.md). N fenêtres avec sessions indépendantes ou partagées ; WASM unique PHP/MariaDB comme cible principale ; SQL à la demande et déchargement évalué sur mesures. Les scénarios à deux joueurs ci-dessous sont des tests, pas une limite produit.

Environnement PHP + MariaDB entièrement dans le navigateur, destiné aux petits projets scolaires, avec PDO/MySQLi natifs, N fenêtres rattachées à des sessions indépendantes ou partagées et une console SQL utilisant la même base. Nom du socle importé : **PHP Browser Lab**.

**État : structure et cartographie réalisées ; PHP 8.4 et les témoins MariaDB/PDO ont passé des tests navigateur amont en CI. Le build MariaDB original et les mesures restent à finaliser. Aucun serveur PHP/MariaDB WASM fusionné n'est encore livré.**

## Commencer

Lire [le contexte consolidé](docs/CONTEXTE.md), [les décisions](docs/DECISIONS.md), puis [le guide de reprise](docs/REPRISE.md). La [roadmap](docs/ROADMAP.md) définit les prochaines étapes et leurs critères de sortie.

Node 20+ et Python 3.12+ ; aucun `npm install` pour le socle :

```bash
npm test
python3 scripts/doctor.py
```

Le premier build moteur est décrit dans [BUILD](docs/BUILD.md) ; il requiert ses propres outils et dépendances, dont le SDK épinglé. Les snapshots d'étude ne constituent pas un SDK hors ligne.

## Ce qui existe

| Élément | État vérifiable |
|---|---|
| Cache LRU borné en octets et entrées | Implémenté, tests Node |
| File PHP séquentielle avec limites et refus de surcharge | Implémentée, tests Node |
| Contrat SQL C | Déclarations uniquement, pas de backend |
| Fixtures scolaires PDO/MySQLi et jeu | Préparées, pas exécutées dans WASM |
| 17 dépôts + 2 sous-modules | Sources épinglées avec SHA-256 |
| 81 repères de code | Cartographie et empreintes dans `provenance/` |
| Runtime, adaptation MySQLi, VFS, Service Worker et interface | À développer |
| Compilations et tests navigateur amont | PHP et bridge réussis ; MariaDB originale échouée sur un en-tête C ; [preuves](engine/baseline/CI-RECEIPT.md) |
| Benchmarks mémoire et performance du produit | Non réalisés ; banc navigateur préparé |

## Sources amont volumineuses

Les archives de `sources.zip` représentent environ 500 Mo ; deux fichiers dépassent la limite GitHub pour un fichier Git. Elles sont conservées hors de l'historique Git, dans la [release des sources](https://github.com/Bastian-Noel/WASMWebServer/releases/tag/sources-2026-10-31). Le workflow vérifie les 19 empreintes avant de publier le ZIP.

Avec GitHub CLI connecté au dépôt privé, depuis la racine :

```bash
gh release download sources-2026-10-31 --repo Bastian-Noel/WASMWebServer --pattern sources.zip --pattern SHA256SUMS
sha256sum -c SHA256SUMS
python3 -m zipfile -e sources.zip .
python3 scripts/fetch-upstream.py
python3 scripts/fetch-native-deps.py
python3 scripts/verify-project.py
```

Sans release locale, les deux scripts `fetch-*` téléchargent les mêmes snapshots aux commits et empreintes verrouillés. [Détails de l'import et de la restauration](docs/IMPORT.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md) : studio propriétaire, sessions, SQL et stockage.
- [Références](docs/REFERENCES.md) et [cartographie](docs/CODE-MAP.md) : code à réutiliser ou adapter.
- [Difficultés](docs/DIFFICULTES.md) : risques techniques et solutions à éprouver.
- [Mémoire et benchmarks](docs/MEMOIRE-BENCHMARKS.md) : budgets et protocole de mesure.
- [Build](docs/BUILD.md), [roadmap](docs/ROADMAP.md), [reprise](docs/REPRISE.md).
- [Analyse détaillée des quatre sources prioritaires](engine/baseline/SOURCE-ANALYSIS.md) et [preuves CI réelles](engine/baseline/CI-RECEIPT.md).

`packages/` contient le socle et le contrat, `fixtures/` les projets de validation, `tests/` les tests Node, `config/` les budgets proposés, `scripts/` les outils de restauration. `provenance/` garde les conversations, verrous et preuves historiques. `sources/`, `upstream/` et `build-work/` sont locaux et ignorés par Git.

L'import réunit `preparation.zip`, `sources.zip` et le complément de conversation fourni le 31 octobre 2026. Les anciens résultats et estimations sont conservés comme historique ; les [décisions consolidées](docs/DECISIONS.md) guident la suite. Les notices amont sont conservées.
