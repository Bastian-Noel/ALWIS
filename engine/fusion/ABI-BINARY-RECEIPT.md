# Jalon 4 — inspection ABI des WASM réellement compilés

Date : 31 octobre 2026. **Preuve limitée à l'inspection statique de fichiers WASM issus des artefacts de GitHub Actions.** Aucun module fusionné ni lien C/PDO direct n'a encore été compilé.

## Binaires et empreintes SHA-256

| Provenance (run 41204266390) | SHA-256 | Octets |
|---|---|---:|
| `baseline-php-8.4` / `php/dist/php/8.4/php.wasm` | `09b58da09878913f67e6a8d6489270c8b22743fd419104c3c495857f008b4317` | 57 730 428 |
| `baseline-mariadb-bridge` / `bridge/.native-build/engine/dist/lite4mariadb.wasm` | `186feeb23deccf1e63586b0ebc45573f46faac3e95919cfb31edb445eff24915` | 16 936 203 |
| `baseline-mariadb-original-compat` / `mariadb/wasm/dist/lite4mariadb.wasm` | `94c21dd0e22a492f0839e4bf233daaebcd072061a780ee4325173076c60c3d29` | 16 929 444 |

## Mémoire et fonctions inspectées

| ABI observée | PHP 8.4 JoomEngine | MariaDB bridge | MariaDB originale |
|---|---|---|---|
| Mémoire | **définie et exportée** sous `memory` | **importée** via `env.memory` | **importée** via `env.memory` |
| Taille initiale déclarée | **128 Mio (2048 pages)** | **256 Mio (4096 pages)** | **256 Mio (4096 pages)** |
| Maximum déclaré | 2 Gio | 2 Gio | 2 Gio |
| Mémoire partagée (`shared`) | **non** | **oui** | **oui** |
| Exports Asyncify | 5 | 0 | 0 |
| Exports pthreads | 0 | présents | présents |
| Pont hôte | `__asyncjs__host_call` importé | `l4m_open`, `l4m_query` exportés | `l4m_open`, `l4m_query` exportés |
| Sessions `l4m_session_*` | — | présentes | absentes |

Ces valeurs sont extraites des sections **import/memory** du WASM (LEB128, pages de 64 Kio), et les noms des exports proviennent de l'API JavaScript WebAssembly.Module.

**Conséquence :** il est impossible d'utiliser *tel quel* l'objet mémoire PHP non partagé comme `env.memory` partagé requis par MariaDB. La fusion ne peut pas être déclarée réussie par juxtaposition des deux modules : elle nécessite un rebuild sous des flags et un espace d'adressage communs, avec une seule instance, un modèle d'ordonnancement compatible, et un pont C direct sans JSON/base64.

## Reproduction

Télécharger les trois artefacts du [run natif 41204266390](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41204266390) et extraire les fichiers listés. Ensuite :

```sh
node scripts/inspect-wasm-abi.mjs php.wasm mariadb-bridge.wasm mariadb-original.wasm
```

L'outil échoue sur WASM invalide et affiche des empreintes et métadonnées vérifiables, sans instancier MariaDB/PHP ni confondre mémoire linéaire et consommation RSS réelle.

## Gate d'intégration suivante (pas encore satisfaite)

1. Définir un build fusionné avec CMake/EMSDK 6.0.6 reproduit, ABI mémoire/pthreads/Asyncify unifiée et contrat des exports C/PDO.
2. Introduire la première fonction C permettant un `SELECT 1` depuis le même binaire que PHP ; aucun worker ou hôte JS de type SQL proxy pendant ce test.
3. Vérifier types, erreurs, transactions, responsabilité du nettoyage, démarrage SQL à la demande et persistance ; quantifier mémoire/latence par rapport à ce baseline.
4. Garder les modules séparés comme témoins tant que les points 1–3 ne sont pas prouvés.

Les résultats du jalon 3 restent incomplets sur la **mémoire de processus**.
