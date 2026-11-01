# Limites appliquées au runtime

Le module principal reste PHP/MariaDB avec pont C. Les quotas ci-dessous s'appliquent au backend Emscripten des appels POSIX, donc aussi aux fonctions de fichiers PHP et aux écritures MariaDB. Ils ne se limitent pas à l'API de fichiers du studio.

| Zone VFS | Octets logiques cumulés | Par fichier | Nœuds (fichiers, dossiers, liens) |
|---|---:|---:|---:|
| Projet | 64 Mio | 16 Mio | 2 048 |
| Temporaire | 16 Mio | 16 Mio | 256 |
| SQL | 128 Mio | 64 Mio | 4 096 |
| Autres chemins, dont ressources embarquées | 16 Mio | 16 Mio | 2 048 |

Maximum de 512 descripteurs ouverts. `NativeRuntime.create({vfsLimits: ...})` permet de **réduire** ces limites ; valeurs inconnues, invalides ou supérieures au profil sont refusées. Ne pas réduire SQL sous le volume de démarrage en supposant que le serveur pourra s'initialiser : les tables système et fichiers InnoDB occupent déjà plusieurs dizaines de Mio.

`vfs-quota.mjs` suit croissance, ftruncate/fallocate, msync, création, suppression et déplacement. Un fichier supprimé mais encore ouvert reste comptabilisé jusqu'à la dernière fermeture. Le remplacement atomique exige la place du fichier temporaire ; son échec doit conserver l'ancien fichier et libérer les nœuds temporaires. Les changements de catégorie lors d'un rename sont contrôlés avant mutation. Le groupe de repli évite qu'un `SELECT … INTO OUTFILE` écrivant hors des dossiers prévus contourne le budget.

Le backend est celui d'Emscripten **6.0.6**. Les contrôles renvoient les erreurs POSIX ENOSPC/EMFILE, que PHP et SQL peuvent traiter. Il ne s'agit pas d'un sandbox pour du JavaScript hostile capable de remplacer le runtime lui-même.

## Mesures et portée

`runtime.state().vfs` expose les octets logiques, la somme des capacités des buffers de fichiers, les nœuds et les descripteurs. Les capacités peuvent compter un buffer partagé plusieurs fois ; ce n'est pas une mesure de RAM résidente. MEMFS suralloue certains buffers et IDBFS peut en copier pendant la synchronisation. Une limite de données n'est donc pas une égalité avec la RAM navigateur.

Le harness natif exerce réellement dans les deux navigateurs : écritures PHP directes, append, ftruncate, fichier ouvert supprimé, réutilisation du quota, renommage, refus sans fuite d'un fichier temporaire atomique, nœuds et descripteurs, quota temporaire et SQL INTO OUTFILE hors projet. Il vérifie ensuite les autres requêtes et la sauvegarde/restauration. Les cas de quotas sont abaissés dans un runtime distinct pour ne pas créer de centaines de Mio de données de test. Les écritures SQL en dehors du dossier projet sont aussi exercées sur le vrai serveur.

Autres limites déjà appliquées : RPC en attente avant copie 8 Mio/64 appels ; file du Worker 8 Mio/32 tâches ; sortie HTTP PHP 8 Mio ; [HTTP sortant](../network-native/README.md) 8 Mio par corps de requête et 16 Mio par réponse pendant la lecture ; collecte de résultat SQL 16 Mio/10 000 lignes ; 32 connexions appelantes ; mémoire linéaire maximale 512 Mio. Le profil observé reste à 256 Mio de capacité dans les fixtures actuelles.

## À consolider

- Erreurs de disque plein pendant agrandissement InnoDB, initialisation SQL incomplète et récupération après interruption.
- Les nouveaux projets ont maintenant un snapshot atomique unique et les échecs de transaction sont exercés ; restent le mode historique à magasins séparés, la migration et les quotas réels du stockage navigateur. Voir `engine/fusion/STORAGE-RECOVERY-RECEIPT.md`.
- Réponses HTTP sortantes : Fetch annule désormais les réponses dépassant le budget pendant la lecture ; restent les copies temporaires autorisées et les buffers réseau/décompression internes au navigateur, distincts des blocs conservés par l'application.
- Longues sessions et mesures continues des pics, en séparant allocateur C, VFS, JS/JIT et PSS navigateur.

Les limites de copie et quotas renforcent les bornes ; elles ne prouvent pas une limite globale de 300 Mio de RAM. Les données persistées par une ancienne version peuvent aussi être chargées par IndexedDB avant qu'un quota plus petit refuse leur restauration ; les magasins existants ne sont pas supprimés automatiquement.
