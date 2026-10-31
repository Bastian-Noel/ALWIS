# Baseline PHP + MariaDB + PDO : mesures de navigateur du 31 octobre 2026

## Provenance et limites

- **Run de compilation** : [41204266390](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41204266390), commit `1ed52d9ba21cab8c9a131b1ac0ac04521c850376`, trois jobs passés.
- **Run de benchmark** : [41212313878](https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41212313878), commit harness `6126674c9d462f5e14dcba6a139c1c99de1c2c9f`, artefact `baseline-browser-measurements` **13046478972** avec JSON bruts complets et les séries de latences de chaque requête.
- PHP **8.4.27** et bridge JoomEngine **v0.1.1**, navigateur Chromium **156.0.8078.4**, Firefox **157.0**, runner Linux Azure Xeon Platinum 8573C, **2 processeurs logiques**, ~**8,3 Go** mémoire hôte. Chaque navigateur : **3 échantillons**.
- Les valeurs reflètent les workers, chargements et instanciations sous CI ; ni moteur WASM unique ni performance garantie d'un PC personnel. Les échantillons bruts sont dans l'artefact GitHub (rétention 90 jours), pas réinventés ci-dessous.

## Résultats (min–max des trois mesures)

| Paramètre (ms) | Chromium | Firefox |
|---|---:|---:|
| Démarrage PHP isolé | 592,2–628,8 | 1331,0–1687,3 |
| Démarrage SQL isolé | 2143,2–3720,0 | 1708,0–2374,5 |
| Démarrage PHP après SQL | 1111,0–1456,6 | 1255,1–1375,5 |
| Requête PHP seule p50 | 16,88–19,13 | 5,70–6,38 |
| SQL seul p50 | 0,76–2,33 | 0,78–1,02 |
| PHP avec 1 SELECT PDO p50 | 25,42–27,47 | 8,38–9,12 |
| PHP avec 10 SELECT PDO p50 | 34,65–34,94 | 15,42–16,12 |
| PHP avec 100 SELECT PDO p50 | 69,82–139,00 | 76,90–78,16 |
| Restauration SQL | 1834,4–3199,4 | 2273,3–2521,0 |
| Persistance InnoDB après restauration | 3/3 | 3/3 |

**RAM : indisponible.** L'API `performance.measureUserAgentSpecificMemory` a renvoyé une erreur « not available » dans Chromium ; elle est absente dans Firefox. Aucune estimation RAM n'est substituée aux données manquantes. Une capture RSS navigateur externe ou une instrumentation de la mémoire WASM doit compléter cette preuve avant de juger les optimisations.

**Version/connexions :** le bridge JoomEngine v0.1.1 limite la création simultanée de bail SQL dans ce test. La mesure SQL seul ferme sa connexion avant la phase PDO. La famille v0.1.8 avec patch de sessions indépendantes est un témoin distinct et ne doit pas être assimilée à ce bridge v0.1.1.

## Étape suivante

La fusion n'est pas accomplie ; le premier audit des *vrais binaires* issus des trois artifacts est dans [engine/fusion/ABI-BINARY-RECEIPT.md](../engine/fusion/ABI-BINARY-RECEIPT.md), reproductible avec `node scripts/inspect-wasm-abi.mjs`. Il confirme la nécessité de reconstruire PHP et MariaDB avec un contrat mémoire et threading commun plutôt que de juxtaposer ces `.wasm`.
