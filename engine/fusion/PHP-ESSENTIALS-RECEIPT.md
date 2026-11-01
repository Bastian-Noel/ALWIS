# PHP essentiel et consolidation PDO/MySQLi — 1 novembre 2026

Ce lot suit l'ordre demandé : PHP et accès SQL, puis vrai éditeur de site, puis administration SQL complète. Il ajoute des fonctions au moteur commun ; les deux éditeurs ne sont pas déclarés terminés.

## Fonctions ajoutées

Le PHP 8.4.27 pthread compilé depuis les sources épinglées intègre maintenant **filter, ctype, tokenizer, fileinfo, mbstring et iconv**. `mbstring` est construit sans mbregex/Oniguruma ; `mb_ereg` n'est donc pas disponible. Le script `scripts/build-php-essentials.sh` étend la recette native existante et conserve son précédent fichier de configuration et son archive dans `build-work/native-profiles/php-minimal-before-essentials`.

L'adaptateur C de PDO convertit les colonnes SQL entières représentables et les flottants dans les résultats directs et préparés. `PDO::ATTR_STRINGIFY_FETCHES` garde les valeurs textuelles lorsque demandé. DECIMAL, entiers hors plage, chaînes numériques, binaire et NULL ne sont pas convertis avec perte. Le PHP WASM de ce build possède des entiers de **32 bits** : `2147483648` reste donc une chaîne, tandis que `-2147483648` est un entier. Aucun changement n'est appliqué aux sources amont : les adaptations sont produites dans le répertoire généré.

MySQLi ajoute `mysqli_savepoint`, `mysqli_release_savepoint` et les méthodes correspondantes. Les noms sont bornés et cités comme identifiants SQL, y compris les backticks ; les noms vides/NUL sont refusés. Une erreur SQL reste une erreur SQL, et la connexion est réutilisable après un savepoint inexistant. L'inventaire passe à **74/106 fonctions procédurales enregistrées** ; ce nombre ne mesure pas une conformité complète.

## Preuves réelles

`tests/browser/php-essentials.mjs` démarre son propre serveur et exécute les fichiers PHP sans mocks dans Chromium 156 et Firefox 157 :

- Validation email/entiers avec bornes, ctype, caractères Unicode, changement de casse et encodages, tokenisation PHP, MIME binaire.
- Hachage/vérification des mots de passe, octets aléatoires et échappement HTML.
- Vrai POST multipart contenant un PNG binaire, `is_uploaded_file`, identification MIME sur fichier temporaire, `move_uploaded_file` et hash des octets conservé.
- PDO natif et émulé : types et stringify, limites des entiers, références modifiées avant execute, LOB, décimaux exacts, affected rows, commit et rollback.
- MySQLi procédural/objet : savepoints, retour arrière partiel, noms cités, erreurs puis récupération ; données partagées avec PDO.
- PHP seul laisse SQL dormant et ne crée aucun worker SQL ; connexions, statements et texte SQL réservé reviennent à zéro après les requêtes.

Reçus : [Chromium](receipts/php-essentials-chromium.json), [Firefox](receipts/php-essentials-firefox.json), [inventaire PHP actuel](receipts/php-essentials-inventory.json). Le précédent inventaire minimal reste conservé séparément.

La suite native complète passe aussi sur [Chromium](receipts/php-essentials-regression-chromium.json) et [Firefox](receipts/php-essentials-regression-firefox.json) avec ce même WASM : CGI/réseau, fixtures précédentes, refus sous quotas, nettoyage, snapshots, erreur injectée/réessai et anciens projets persistants. Le [parcours studio Chromium](receipts/php-essentials-studio-chromium.json) passe : fenêtres/sessions, édition de données, sauvegarde et export/restauration SQL (valeurs exactes, vues et routines). Le parcours studio Firefox n'a pas été rejoué pour ce lot. Les 35 tests JavaScript passent. Le [manifeste](receipts/php-essentials-source-manifest.json) conserve les hashes du moteur et des sources ; la [copie générée du driver](receipts/php-essentials-driver-adapter.json) reste traçable.

```sh
source /workspace/toolchains/host/activate.sh
source build-work/emsdk/emsdk_env.sh
JOBS=3 bash scripts/build-php-essentials.sh
PBL_TARGET=pbl-runtime JOBS=3 bash engine/fusion/spike/build.sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/php-essentials.mjs
```

## Coût et limites

Le WASM passe de **33 301 236 à 38 207 412 octets** (+4 906 176, environ 4,68 Mio). La mémoire linéaire reste à **256 Mio** dans ces scénarios et la limite demeure 512 Mio. Après activation SQL, 16 workers sont créés, dont 15 utilisés au maximum. Ce lot n'a pas remesuré la RAM physique totale du navigateur : ne pas réutiliser les anciens chiffres comme s'ils décrivaient ce nouveau binaire, ni assimiler mémoire linéaire et RAM physique.

Restent à réaliser : zlib/ZIP et DOM/XML/SimpleXML, puis les extensions crypto/images selon les projets de référence ; conformité PDO supplémentaire (attributs, curseurs, résultats multiples, LOB en flux) et MySQLi (options, diagnostics complets, long-data, attributs, multi-résultats). Les scénarios passent sur de petits projets ; ils ne prouvent ni compatibilité phpMyAdmin/WordPress, ni endurance, ni plafond universel sur toute requête SQL. cURL, OpenSSL et GD ne sont pas présents. Le wrapper HTTP reste soumis à CORS et aux capacités du navigateur.

L'ordre détaillé des prochains travaux est dans [PROCHAINES-ETAPES.md](../../docs/PROCHAINES-ETAPES.md).
