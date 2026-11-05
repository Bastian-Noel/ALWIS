# Stockage des projets sur disque

Les fichiers du projet sont conservés dans **OPFS**, le disque privé du navigateur. IndexedDB conserve leur catalogue et les générations de sauvegarde. Ouvrir l’explorateur ne lit pas leur contenu. Les fichiers inconnus restent binaires ; un SVG est éditable mais n’entre pas automatiquement dans l’analyse du code.

Les imports dossier et ZIP présentent d’abord une sélection. Les dépendances `node_modules`, `vendor`, caches et archives sont décochées par recommandation ; elles peuvent être incluses explicitement. Composer peut avoir besoin de `vendor/autoload.php`. Les fichiers sont copiés successivement, avec vérification de taille et CRC, avant ouverture d’un projet distinct. Annuler nettoie la copie provisoire. L’import ne modifie pas les fichiers du PC.

## Budgets séparés

| Usage | Protection actuelle |
|---|---|
| Projet sur disque | 2 Gio, 10 000 fichiers, 32 000 nœuds |
| Fichier sur disque | 512 Mio |
| Analyse préalable | 50 000 entrées ; profondeur d’import 12 |
| Répertoire central ZIP | 16 Mio ; ZIP64 et multi-volumes refusés |
| Édition | 1 Mio par fichier |
| Extrait de gros texte | 64 Kio, sur demande |
| Lectures PHP depuis OPFS | pages de 64 Kio ; cache LRU de 4 Mio |
| Fichiers modifiés par PHP | 16 Mio par fichier ; 64 Mio cumulés en mémoire |
| Sessions PHP sur disque | 16 Mio, 1 024 fichiers en plus du projet |
| Dumps SQL d’une sauvegarde | 8 Mio par base ; 64 Mio cumulés |

Ces plafonds sont des protections, pas une garantie de capacité de chaque navigateur. L’espace disponible est vérifié avec une marge d’au moins 16 Mio ou 15 % du volume. L’espace nécessaire à un export s’ajoute au projet déjà stocké. La compression ne dispense pas du contrôle des tailles réellement produites ; les entrées démesurément compressées sont refusées.

## PHP et aperçus

Les chemins PHP restent `/workspace/...`. `stat`, les listes, `fopen`, `fread` et `fseek` fonctionnent sur les métadonnées et les lectures OPFS du worker. Une modification matérialise uniquement le fichier concerné, sous le budget RAM. Elle devient persistante lors de **Enregistrer**. Les écritures volumineuses dépassant 16 Mio sont actuellement refusées : il ne s’agit pas encore d’un pont d’écriture PHP intégralement en flux.

`file_get_contents()` alloue le contenu demandé dans PHP et reste soumis à sa limite mémoire. La réponse PHP est encore collectée avec les limites existantes du runtime : `readfile()` n’est donc pas une voie de diffusion illimitée pour les gros médias. Servez-les directement comme fichiers statiques.

Le Service Worker reçoit des références de fichiers et répond avec des `Blob` sur disque : HTTP Range simple, suffixe, HEAD, ETag et erreurs 416. Les médias ne sont pas ajoutés à CacheStorage. Les URL appartiennent au projet/session ; les versions immuables, ETag et l’absence de cache empêchent de réutiliser une ancienne donnée. Les mutations PHP et celles de l’atelier invalident les références concernées. Les petits documents HTML restent instrumentés pour la navigation de l’aperçu ; ce traitement est limité à 2 Mio.

## Sauvegarde, migration et export

Une sauvegarde prépare un catalogue immuable puis inscrit sa génération dans le checkpoint SQL atomique. Les fichiers inchangés sont réutilisés. La génération du checkpoint est prioritaire sur l’index de reprise. La migration d’un ancien projet copie et relit les fichiers pour vérifier leur CRC avant de libérer leur copie RAM ; elle conserve l’ancien checkpoint sur disque jusqu’à la sauvegarde réussie.

Le nettoyage conserve au moins les trois générations récentes et celles de moins de 24 heures. Seuls les objets inaccessibles de plus de 24 heures sont retirés après une sauvegarde. Cette rétention peut temporairement augmenter l’occupation disque ; une erreur de quota doit être traitée par export et libération d’espace.

Le ZIP complet est écrit successivement dans un fichier temporaire OPFS, avec compression des textes lorsque le navigateur le permet. Son catalogue central est borné ; aucun tableau contenant toute l’archive n’est assemblé. Le téléchargement utilise une URL de fichier temporaire, libérée après une minute. Les exports temporaires de plus de 24 heures sont nettoyés au prochain export. Les petits dumps SQL utilisent encore le chemin mémoire borné décrit ci-dessus.

La persistance du stockage est demandée sans bloquer l’import. Un refus est signalé. **OPFS n’est pas une sauvegarde externe** : effacer les données du site supprime les projets. Exportez régulièrement les projets importants.

## Preuves reproductibles

- `node tests/browser/disk-storage.mjs` : média de 256 Mio produit par blocs de 256 Kio ; lecture PHP en fin de fichier ; Range/HEAD/416 ; sauvegarde/redémarrage ; export ZIP, décompression et CRC ; téléchargement réel et taille ; annulation et CRC incorrect. Exécuté dans Chromium et Firefox. Résultats : `build-work/disk-storage/results.json`.
- `node tests/browser/disk-migration.mjs` : checkpoint IDBFS créé avec le vrai runtime, migration et reprise de PHP, sessions et SQL ; ancien checkpoint inchangé avant sauvegarde.
- `node tests/browser/zip-selection.mjs` et `folder-opening.mjs` : sélection, exclusions, annulation, dépendances, archives invalides et restauration du contexte local.

Sur le scénario de 256 Mio, le quota RAM des fichiers PHP inchangés est **0 octet** après ouverture et après redémarrage ; le cache utilisé pour la lecture ciblée est d’environ 65 Kio, sous le plafond de 4 Mio. La mémoire linéaire du runtime conserve son allocation initiale de 256 Mio. Ces compteurs ne mesurent pas la RAM totale du navigateur ni toutes ses copies internes : aucun objectif global de RAM n’est annoncé à partir d’eux. Le plafond de 2 Gio n’est pas présenté comme un volume intégralement éprouvé par ce scénario.

Les miniatures d’images ne sont pas générées automatiquement. Une galerie et un lecteur vidéo avec navigation réelle, Safari et une mesure globale de mémoire sur longue durée restent à approfondir.
