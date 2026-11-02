# État de l’expérience de fusion — 31 octobre 2026

**Premier jalon validé sur Chromium et Firefox** : PHP exécute SELECT 1 via les appels C de la MariaDB embarquée dans le même module principal. Les reçus et l’ABI du binaire sont dans `receipts/`. Ce succès ne valide pas encore le runtime CGI/PDO/MySQLi complet.

- Toolchain Emscripten 6.0.6 installée et activée ; outils hôtes Debian 13 extraits sans privilèges dans `/workspace/toolchains/host`.
- PHP 8.4.27 officiel, archive vérifiée avant extraction. Configuration minimale embed/PDO/session, tous les objets PHP recompilés avec `-pthread`, adaptation Fiber épinglée appliquée. L’archive libphp.a a été produite.
- MariaDB épinglée avec sous-modules exacts et patch natif de sessions du bridge v0.1.8 ; compilation de la bibliothèque serveur embarquée réalisée sous la même toolchain. Cela ne réutilise pas le SIDE_MODULE PDO de la famille Sean Morris.
- Le premier lien commun a révélé des symboles PCRE2 en double entre PHP et MariaDB. Aucun `--allow-multiple-definition` n’est utilisé. Correction appliquée via l’option PHP officielle `--with-external-pcre`, sur la PCRE2 10.47 déjà compilée pour MariaDB.
- Échecs de préparation corrigés : probes Autoconf CommonJS, ncurses hôte dans le préfixe local, chemin M4 explicite, cible native `import_executables` terminée après un premier build interrompu. CMake n’autorise pas add_subdirectory en exécution différée ; l’injection utilise maintenant include pour ajouter le target sans éditer les sources amont.
- Un rafraîchissement des outils concurrent au build a causé `Text file busy` sur CMake. Les deux helpers partagent maintenant un verrou exclusif/partagé ; la reprise réutilise les objets valides.

Les logs complets sont dans `build-work/` (ignoré). Le test réel exige l’assertion PHP → API C → MariaDB `SELECT 1`, exactement un appel réussi, le contrôle du résultat et un arrêt SQL explicite. La compilation et le contrôle de syntaxe ne suffisent pas.

## Résultat navigateur du premier spike

Deux navigateurs réussis : sortie PHP `fusion-select-one-ok`, contrôle PHP du résultat SQL et de preg_match sur PCRE2 commune, compteur C de requête égal à 1, SQL non initialisée à l’instanciation, arrêt explicite confirmé. Capacité linéaire observée : **777781248 octets** ; ce n’est ni la RAM physique ni un profil optimisé. Le runtime CGI suivant utilise le modèle d’allocateur PHP suivi du runtime amont.

Le premier contrôle a échoué sur une sortie PHP sans saut de ligne restée dans le tampon stdout ; l’assertion a été conservée et la sortie corrigée avant les deux succès. Aucun résultat SQL simulé n’a été substitué.

Le target `pbl-runtime` ajoute maintenant le backend de connexions C commun, PDO/MySQLi, les opérations POSIX et les streams navigateur. Les parcours CGI/PDO/MySQLi/fichiers/HTTP, la console indépendante et la sauvegarde/reprise sont maintenant validés sur les deux navigateurs ; voir `../NATIVE-RUNTIME-RECEIPT.md`.
