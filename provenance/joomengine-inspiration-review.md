# Revue des références JoomEngine — 11 novembre 2026

Références examinées à la demande du titulaire :

- [mariadb-wasm-bridge, f86e60d](https://github.com/joomengine/mariadb-wasm-bridge/tree/f86e60dcd330b62c81faf17b3846576124029e21).
- [php-wasm-int64, 683f859](https://github.com/joomengine/php-wasm-int64/tree/683f85906c633e58e679c8428a2f0694b8f2a563).

## Décisions pour ALWIS

Le bridge sépare PHP et MariaDB, avec protocole hôte versionné, connexions indépendantes, fermeture avec rollback, budgets de connexions et checkpoints explicites. ALWIS lie PHP/MariaDB dans un même WASM : la séparation du bridge ne doit pas être présentée comme notre architecture. Nos tests natifs vérifient les sessions privées, les données partagées, la récupération après erreur, la charge et la restauration après interruption. Les reçus de checkpoint doivent rester distincts d'une promesse de sauvegarde à la fermeture du navigateur.

Le projet int64 conserve des pointeurs wasm32 avec des entiers PHP signés sur 64 bits. Il utilise une ABI spécifique et des extensions recompilées ; ce n'est pas Memory64. ALWIS conserve pour cette version son ABI PHP wasm32 avec entiers 32 bits. PDO/MySQLi renvoient les entiers SQL hors plage sous forme de texte exact. Il faut tester les limites int32, les limites de précision JavaScript et les bornes BIGINT ; convertir ces valeurs en flottants serait une perte de données. Une migration int64 ultérieure exigera la reconstruction de toutes les extensions et les tests des conversions vers les tailles mémoire wasm32.

Les deux projets épinglent sources, patches et outils. ALWIS vérifie déjà les entrées natives avant de restaurer un artefact CI, et conserve les sept archives amont, les sources modifiées et les sources runtime Emscripten dans le paquet correspondant. La réussite d'un cache ne remplace pas les tests du binaire restauré.

Aucun code natif Apache-2.0 de ces dépôts n'a été importé à l'occasion de cette revue. Les améliorations sont des contrôles de comportement et de provenance adaptés à ALWIS.

## Correction de l'analyse historique de licence

La [notice au commit 56d47b4](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/patches/NOTICE) indique explicitement GPL-2.0-only pour le patch moteur et le glue modifié. La licence Apache-2.0 à la racine du dépôt ne doit pas leur être attribuée. Notre précédent grief Apache/GPL concernant ce patch est retiré.

Copie exacte : `joomengine-historical-engine-NOTICE.txt`, SHA-256 `bd9a9d4e7357de8d04722e3888c69b7166ab093897dd0eabd5403867ab84a7fe`. Cette constatation ne change pas la licence des autres fichiers du bridge et ne suffit pas à valider un ancien binaire dont tous les objets n'ont pas été reconstitués.
