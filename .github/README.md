# GitHub Actions ALWIS

| Ordre | Fichier stable | Role |
| --- | --- | --- |
| 01 | source-checks.yml | Contrats, tests unitaires et preparation des sources |
| 02 | native-rebuild-ci.yml | Sources natives epinglees ; compilation manuelle avec mode=compile ou commit [native-rebuild] |
| 03 | check.yml | Validation complete Studio Chromium/Firefox et paquet statique du commit exact |
| 04 | guest-iframe-smoke.yml | Verification ciblee des invites HTTP et de leur isolation |
| 05 | publish-wiki.yml | Documentation independante |
| 06 | publish-ftp.yml | Manuel sur main : controle, reutilisation du paquet CI, release avec sources natives, transfert FTP |
| 07 | publish-server.yml | Automatique apres FTP reussi : image GHCR AMD64/ARM64 du meme paquet |

Les noms affiches sont numerotes ; les noms de fichiers restent stables pour les appels API. Les deux workflows de migration retires sont conserves dans archived-workflows avec extension .disabled. Ils ne sont plus executables.

## Caches

- npm : cache setup-node, indexe par package-lock.json ; npm ci reste obligatoire.
- Editeurs : archives amont indexees par engines.lock.json, empreintes verifiees au build.
- Navigateurs : action partagee actions/browser-tests, meme cache Playwright 1.64.1 pour les workflows 02/03/04 ; dependances systeme installees et tests toujours executes.
- Sources natives : sept archives epinglees et verifiees, cache commun aux jobs de preparation et de compilation.
- Conteneur : cache Buildx GHA scope=alwis-server pour AMD64/ARM64.
- Aucun cache de projet utilisateur ni remplacement d'un artefact valide par un binaire historique. Un cache ne vaut pas une validation.

## Publication

Attendre le succes de 03 sur main, puis lancer 06 avec version=v2026.11.0-beta.1 correspondant a package.json. Le workflow 07 suit automatiquement le succes de 06. La release fournit le paquet statique et les sources du WASM correspondant exactement a son empreinte.

publication_policy.py est le controle commun au preflight, a la release, au FTP et au conteneur. Pour cette version, le titulaire a demande une exception interne limitee a main/snprintf.c et main/spprintf.c. Elle ne supprime ni leurs notices ni le constat de compatibilite non resolu ; elle ne confere aucun droit tiers. Tout autre blocage, une version differente ou une notice alteree est refuse.

## Relancer une release existante

Le champ optionnel source_sha du workflow 06 permet de reprendre un commit main deja valide. La version doit toujours correspondre au paquet. Une release publique existante est reutilisee seulement si le ZIP publie correspond a son empreinte SHA256SUMS et si chaque fichier est identique a l'artefact CI valide ; ses fichiers ne sont jamais remplaces. Le workflow 07 lit le commit reel dans l'artefact studio-static-source, au lieu de supposer que le code de deploiement et le paquet applicatif ont la meme revision.

L'inventaire FTP doit correspondre exactement a release.json (avec au plus 250 fichiers et 128 Mio), sans PHP executable. L'ancienne limite fixe de 100 fichiers ne correspondait plus aux notices et ressources du Studio.
