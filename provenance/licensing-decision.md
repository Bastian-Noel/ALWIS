# ALWIS — état de l’audit licences et décision de distribution

**État au 8 novembre 2026 : aucune licence globale n’est en vigueur.** Ce rapport fixe les faits vérifiés et les choix possibles. Il ne remplace pas un avis juridique sur la distribution du runtime combiné.

Voir aussi la [cartographie de licences par composant](component-license-map.md) pour la répartition proposée entre le code ALWIS original et les composants tiers.

## Décision

Ne pas publier maintenant une licence « ALWIS — non commercial » à la racine en la présentant comme applicable à tout le dépôt ou à toutes les releases.

La compilation native actuelle lie PHP et le serveur MariaDB dans le même module `pbl-runtime.wasm` : la recette documente `libphp.a` et `libmariadbd.a` comme bibliothèques du runtime combiné ([reçu natif](../engine/fusion/receipts/native-runtime/source-manifest.json), [recette](../engine/native/build/README.md)). MariaDB Community Server est sous GPLv2. La FAQ de MariaDB avertit qu’un produit distribué avec MariaDB peut relever de la GPL lorsque le produit dépend du serveur ; elle précise aussi que son explication n’est pas un avis juridique définitif. Il serait donc trompeur de promettre que le binaire et l’application livrés ensemble sont réservés aux usages non commerciaux. [FAQ officielle MariaDB](https://mariadb.com/docs/general-resources/community/community/faq/licensing-questions/licensing-faq)

**GPL-2.0-only est le candidat pour le runtime combiné, pas encore une licence validée pour tout le dépôt.** Deux vérifications sont déterminantes :

- PHP 8.4.27 contient la PHP License 3.01, que PHP indique incompatible avec la GPL. Le texte de la 3.01 autorise toutefois à choisir une version ultérieure publiée par le PHP Group ; PHP confirme que les versions antérieures peuvent être distribuées sous PHP License v4, compatible GPL. Ce choix doit être consigné dans les notices et appliqué aux fichiers PHP concernés après vérification des exceptions fichier par fichier. PHP exige le texte et les mentions dans chaque copie distribuée. [Licence exacte de PHP 8.4.27](https://raw.githubusercontent.com/php/php-src/PHP-8.4.27/LICENSE) · [FAQ officielle de licence PHP](https://www.php.net/license/) · [Règles de distribution PHP](https://www.php.net/license/distrib-guidelines-code.php)
- Le sous-module wolfSSL épinglé prévoit une exception : lorsqu’il est combiné à MariaDB Server, le distributeur peut choisir GPLv2 au lieu de GPLv3. Il faut préserver le texte intégral de cette exception. [LICENSING au commit épinglé](https://github.com/wolfSSL/wolfssl/blob/1d363f3adceba9d1478230ede476a37b0dcdef24/LICENSING)

**Le conflit potentiel n’est pas limité à JoomEngine.** Le pont `joomengine/mariadb-wasm-bridge` épinglé est déclaré Apache-2.0 ; le registre référence précisément `patches/engine/independent-sessions.patch`, appliqué au code MariaDB dans le build. Apache-2.0 n’est pas compatible avec GPLv2 pour du code incorporé dans une œuvre combinée ; la FSF considère Apache-2.0 compatible avec GPLv3, pas GPLv2. Il faut confirmer les droits/licences de ce patch et obtenir une permission compatible ou le remplacer. Comme MariaDB est GPLv2, on ne peut pas simplement déclarer le runtime entier GPLv3. [Patch au commit épinglé](https://github.com/joomengine/mariadb-wasm-bridge/blob/56d47b4dc867af313592efa09e12df470a36e129/patches/engine/independent-sessions.patch) · [ASF sur Apache-2.0 et GPL](https://www.apache.org/licenses/GPL-compatibility) · [FSF sur la compatibilité](https://www.gnu.org/licenses/license-compatibility.en.html)

L’éditeur distribue aussi du contenu Apache-2.0 : `typescript` 5.9.3 est intégré au worker JavaScript et `@swc/wasm-web` 1.16.21 est livré comme `swc.wasm`. Ils apparaissent dans `package-lock.json` et sont effectivement inclus par `scripts/build-editor.mjs`. Ce ne sont pas automatiquement des bloqueurs si les artefacts restent des œuvres séparées ; il faut établir si la distribution les agrège ou les combine juridiquement avec le runtime/application, et conserver leurs textes de licence. Le paquet `@bjorn3/browser_wasi_shim` offre MIT ou Apache-2.0 : choisir MIT est possible si l’usage respecte ses conditions.

Le registre mentionne enfin des projets AGPL (DrawDB, ChartDB, Outerbase) comme sources étudiées/inspirations, sans dépendance directe correspondante dans le `package.json`. Cela n’établit pas une copie. Une comparaison des fichiers ALWIS est nécessaire avant d’écarter toute reprise AGPL. Le dépôt `joomengine/php-wasm` est épinglé comme alternative dans la carte de provenance, tandis que la recette native fait référence à un patch fibres dont le chemin n’existe pas dans le commit archivé : cette provenance doit être corrigée avant toute conclusion sur sa licence ou son inclusion.

## Ce que tu peux choisir

| Priorité | Régime cohérent à étudier | Conséquence |
|---|---|---|
| Garder le runtime PHP + MariaDB intégré | Candidat à étudier : `GPL-2.0-only` pour l’œuvre combinée, après résolution du patch Apache-2.0, du contenu Apache de l’éditeur, choix PHP License v4 et vérification des autres fichiers | La GPL autorise aussi l’usage et la redistribution commerciaux. Elle ne permet pas d’imposer une restriction non commerciale à ce runtime. |
| Interdire l’usage commercial de l’application entière | Remplacer/découpler le serveur MariaDB GPL, ou obtenir des droits alternatifs couvrant effectivement tous les composants concernés, puis auditer les autres sources | Peut demander une évolution d’architecture et/ou des accords de licence ; un accord commercial MariaDB seul ne règle pas automatiquement les droits PHP, connecteur, wolfSSL, pont et autres apports. |
| Garder l’architecture mais protéger certains fichiers ALWIS | Définir une licence non commerciale uniquement sur des fichiers ALWIS originaux identifiés, hors code tiers et hors combinaison que la GPL impose de distribuer sous ses conditions | Ce n’est pas une restriction commerciale garantie sur le produit complet ; il faut une revue de la frontière exacte des composants et du paquet distribué. |

La GPLv2 autorise la vente et l’usage commercial des copies, impose ses conditions de redistribution et l’accès au code source correspondant pour les binaires concernés ; elle exige aussi que les fichiers modifiés distribués signalent les modifications et leur date. Elle n’impose pas une citation promotionnelle de l’auteur. [FAQ GPLv2 de la FSF](https://www.gnu.org/licenses/old-licenses/gpl-2.0-faq.en.html) · [Texte et résumé GPLv2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.cs.html)

## Demande d’attribution et de mention des modifications

PolyForm Noncommercial 1.0.0 autorise la modification et la redistribution non commerciale et exige de transmettre son texte ainsi que les lignes `Required Notice:` fournies. Son texte standard ne demande pas en soi de publier les modifications ni de les redistribuer sous la même licence. Pour exiger une attribution plus précise et une mention des changements, il faudrait un addendum de licence explicite ou une licence sur mesure, distincte du texte officiel ; cette condition ne peut pas enlever les droits accordés par une licence tierce. [Texte officiel PolyForm](https://polyformproject.org/licenses/noncommercial/1.0.0)

Pour les fichiers ALWIS auxquels une telle condition s’appliquerait, le registre préparé est [`reuse-ledger.csv`](reuse-ledger.csv). La règle envisagée est : conserver l’auteur, le lien du projet et le texte de licence ; signaler visiblement qu’une copie est modifiée et résumer les changements lors de sa redistribution. Cela ne signifie pas que l’auteur du fork doit publier tout son code source, sauf obligation distincte applicable (par exemple GPL sur un binaire concerné).

## État des sources et notices

- `provenance/upstream-lock.json` épingle 17 dépôts ; `submodules-lock.json` documente les gitlinks. Ce sont des repères de provenance, pas une décision d’incorporation ni une preuve de conformité.
- `provenance/source-map.csv` contient des références d’étude/adaptation. Ses anciennes actions (dont « adapter / comparer ») ne prouvent pas si l’expression source a été copiée. Les entrées DrawDB, ChartDB, Outerbase et XYFlow sont des pistes d’inspiration dans ce registre ; elles ne figurent pas comme dépendances directes du `package.json` actuel. Il faut encore comparer les fichiers suspects pour conclure sur des reprises.
- `package-lock.json` donne les licences déclarées pour 69 paquets npm : 64 MIT, 2 Apache-2.0, 1 BSD-3-Clause, 1 `MIT OR Apache-2.0`, 1 MPL-2.0. Le `THIRD-PARTY.txt` de l’éditeur est généré depuis les paquets de l’éditeur et les moteurs PHPantom/SuperHTML ; il ne constitue pas l’inventaire des licences PHP/MariaDB du WASM.
- La distribution statique copie le binaire `pbl-runtime.wasm`, les notices éditeur, `LICENSES/` et les fichiers de statut/licence. Le Docker reprend ces mêmes fichiers depuis le paquet statique. Le manifeste natif copie également les notices. Les sources archivées gardent des notices à l’intérieur des archives, mais cela ne les place pas automatiquement à côté du binaire distribué.
- Le dépôt répertorie des archives sources séparées et leurs sommes. Pour satisfaire les obligations de source d’un binaire GPL, il faut vérifier que la source correspondante exacte, les patchs, les recettes et les instructions de reconstruction restent accessibles avec la release concernée, pas seulement dans une archive historique éventuellement supprimée.

## Ce qui manque pour une publication juridiquement propre

1. Auditer les fichiers effectivement liés dans `pbl-runtime.wasm`, y compris MariaDB, Connector/C, wolfSSL, les patchs du pont et les exceptions par fichier ; vérifier chaque texte de licence depuis le commit exact.
2. Générer pour chaque release une nomenclature (SBOM) reliant chaque artefact livré à ses sources, commit, hash, licence et emplacement de notice.
3. Comparer les cibles de `source-map.csv` aux sources ALWIS et enregistrer chaque reprise réelle dans `reuse-ledger.csv`. Remplacer ou retirer toute reprise dont la licence ne peut pas être respectée.
4. Choisir explicitement une des trois priorités ci-dessus ; faire relire la licence correspondante et la combinaison WASM/Docker avant d’ajouter un `LICENSE` à la racine.
5. Compléter l’inventaire natif pour les composants réellement liés et joindre, avec chaque binaire GPL, le code source correspondant exact et ses instructions de reconstruction.
6. Documenter si les composants Apache-2.0 de l’éditeur sont distribués comme éléments séparés ou combinés au runtime GPLv2, et vérifier les obligations correspondantes dans le paquet statique et Docker.

Les commits visibles sont attribués à Bastian sous trois formes de nom/adresse ; ils ne prouvent pas à eux seuls la titularité juridique, les apports hors Git, ni les contrats éventuels. Vérifier ces éléments avant de concéder une licence exclusive ou non commerciale. L’absence actuelle de licence globale signifie que le dépôt public n’accorde pas par défaut une permission générale de copie et redistribution du code ALWIS original. [Documentation GitHub sur les dépôts sans licence](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)
