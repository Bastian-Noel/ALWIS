# Mémoire et performances mesurées

> Rapport historique du 5 novembre 2026, conservé avec sa révision et ses résultats. Il ne mesure pas le nouveau build indépendant de la bêta. Pour comprendre les périmètres avant les chiffres, lisez [Mémoire en bref](performance-summary.md).

[← Vue simplifiée avec graphiques](performance-summary.md)

> Dernière campagne intégrée : 5 novembre 2026, Windows 11, révision [`5038537f558e95307f18bd8e9738e20e9ab3fab`](https://github.com/Bastian-Noel/ALWIS/commit/5038537f558e95307f18bd8e9738e20e9ab3fab), Playwright 1.64.1. Les chiffres décrivent cette révision de test, pas automatiquement chaque version publiée.

## Lire les mesures

La mesure principale est la **mémoire résidente privée, en Mio**, additionnée sur les processus du navigateur de test. Les pages partageables sont exclues. Ce n’est ni la PSS Linux des anciens rapports, ni la somme des working sets, ni la capacité mémoire WASM. Un Mio vaut 1 048 576 octets. Les valeurs sont des moyennes ± écart-type des lancements indépendants.

Le rapport compte 148 exécutions valides et deux écartées. La campagne a été arrêtée avant les cinq répétitions prévues : la plupart des scénarios n’ont que deux ou trois lancements. Les résultats indiquent des coûts et des écarts observés, pas des budgets garantis. Les écrans Données, Schéma et Aperçu ont été mesurés au-dessus d’un moteur déjà actif ; leur coût ne doit pas être attribué au seul SQL.

## Résultats principaux

Chaque navigateur démarrait avec un profil vierge. Le Campus utilise son moteur et ses vraies données. La dernière colonne indique le nombre de lancements Chromium / Firefox.

| Configuration | Chromium (Mio) | Firefox (Mio) | Lancements C / F |
|---|---:|---:|---:|
| Navigateur et page HTML vide | 52,9 ± 0,1 | 249,8 ± 1,2 | 3 / 2 |
| Moteur PHP seul, réponse vérifiée | 236,2 ± 0,6 | 430,2 ± 1,1 | 3 / 2 |
| PHP et fichiers Campus, SQL non initialisé | 236,9 ± 0,2 | 431,9 ± 0,1 | 3 / 2 |
| PHP et SQL initialisé, `SELECT 42` | 354,0 ± 0,4 | 571,5 ± 6,0 | 3 / 2 |
| Campus installé, 34 tables | 382,1 ± 1,0 | 564,1 ± 2,0 | 3 / 2 |
| Studio ouvert, aucun projet | 78,5 ± 0,0 | 289,3 ± 1,9 | 3 / 2 |
| Studio et projet PHP vide en arrière-plan | 250,5 ± 0,2 | 468,8 ± 7,0 | 3 / 2 |
| Studio et Campus en arrière-plan | 405,1 ± 0,6 | 611,0 ± 7,0 | 3 / 2 |
| Campus, écran Sessions, éditeur non créé | 405,1 ± 1,3 | 659,3 ± 8,7 | 3 / 2 |
| Éditeur PHP, coloration seule, services en veille | 79,6 ± 0,2 | 283,8 ± 0,8 | 3 / 2 |
| Éditeur PHP avec analyse automatique | 159,2 ± 0,0 | 368,2 ± 7,2 | 3 / 2 |
| Éditeur HTML avec analyse SuperHTML | 81,1 ± 0,4 | 277,0 ± 2,2 | 3 / 2 |
| Éditeur CSS avec analyse locale | 70,0 ± 0,2 | 271,9 ± 2,8 | 3 / 2 |
| Éditeur JavaScript avec TypeScript et SWC | 186,6 ± 0,3 | 445,5 ± 13,2 | 3 / 2 |
| PHPantom seul, indexation et analyse du Campus | 135,5 ± 0,2 | 332,5 ± 28,8 | 3 / 3 |
| PHPantom et demande de complétion PDO | 140,1 ± 0,3 | 326,7 ± 14,4 | 3 / 3 |
| SuperHTML seul, analyse HTML | 68,4 ± 0,1 | 262,5 ± 6,4 | 3 / 3 |
| TypeScript et SWC seuls, analyse JavaScript | 176,8 ± 1,6 | 426,5 ± 13,8 | 3 / 2 |
| TypeScript et SWC, complétion jQuery demandée | 176,6 ± 1,5 | 418,2 ± 5,4 | 3 / 2 |
| Campus et éditeur PHP en veille | 375,4 ± 76,4 | 664,6 ± 3,5 | 3 / 2 |
| Campus et éditeur PHP avec analyse | 496,6 ± 1,1 | 829,1 ± 2,7 | 3 / 2 |
| Campus et aperçu PHP, éditeur non créé | 424,6 ± 0,4 | 655,1 ± 1,6 | 3 / 2 |
| Campus et deux aperçus, éditeur non créé | 427,7 ± 5,1 | 658,3 ± 2,3 | 3 / 2 |
| Campus et schéma, éditeur non créé | 419,5 ± 0,8 | 669,0 ± 2,2 | 3 / 2 |
| Campus et grille de données, éditeur non créé | 411,4 ± 3,0 | 652,8 ± 1,9 | 3 / 2 |
| Campus et structure de table, éditeur non créé | 414,1 ± 0,2 | 653,9 ± 0,8 | 3 / 2 |
| Campus et console SQL CodeMirror, éditeur PHP non créé | 413,5 ± 1,2 | 653,4 ± 1,7 | 3 / 2 |
| Session cumulée : éditeur, aperçu, données, console, schéma et réseau | 522,4 ± 2,0 | 805,2 ± 50,9 | 3 / 2 |

Firefox démarre ici avec une empreinte plus élevée, même sur une page vide. Il faut comparer chaque navigateur à son propre témoin : l’écart entre les deux colonnes ne mesure pas à lui seul le coût d’ALWIS.

## Modes mesurés et activation SQL

Les configurations du tableau sont des scénarios de mesure, pas des profils sélectionnables dans l’interface. L’ouverture d’un projet PHP démarre le moteur commun ; sans requête SQL, le rapport observe zéro Worker SQL et aucun fichier de base dans le VFS. Quand SQL est utilisé, le pool mesuré crée 16 Workers et le datadir est chargé. Le moteur MariaDB reste donc évité pour les projets qui n’utilisent pas SQL.

La mémoire linéaire WASM mesurée commence à 256 Mio. Le plafond effectif annoncé par le build de test est 512 Mio. Ce sont des capacités de réservation/croissance, pas des quantités de RAM physique à ajouter aux valeurs du tableau.

## Surcoût observé des services et outils

Les différences ci-dessous soustraient un témoin correspondant. Elles ne sont pas additives : initialisation, compilation, collecte mémoire et libérations peuvent se chevaucher.

| Comparaison | Chromium (Mio) | Firefox (Mio) | Lecture |
|---|---:|---:|---|
| PHP seul, au-dessus de la page vide | +183,3 | +180,4 | Surcoût observé du moteur commun |
| MariaDB activée, PHP déjà actif | +117,9 | +141,3 | Mesure appariée : +117,3 ± 0,8 / +141,0 ± 6,0 |
| Fichiers Campus ajoutés sans démarrer SQL | +0,7 | +1,7 | Faible dans cette fixture |
| Installation des 34 tables, SQL déjà actif | +28,1 | -7,4 | Firefox : différence non résolue |
| PHPantom, indexation/analyse seule | +82,6 | +82,8 | Au-dessus de la page vide |
| SuperHTML, analyse HTML seule | +15,5 | +12,8 | Au-dessus de la page vide |
| TypeScript et SWC, analyse JavaScript | +123,9 | +176,7 | Au-dessus de la page vide |
| Complétion PDO après analyse PHP | +4,6 | -5,8 | Firefox : différence non résolue |
| Éditeur PHP avec analyse ajouté au Campus | +90,2 ± 0,1 | +154,9 ± 9,9 | Mesure appariée dans le studio |
| Session cumulée ajoutée au témoin Campus | +116,0 ± 0,7 | +139,5 ± 50,6 | Mesure appariée ; forte dispersion Firefox |

Un résultat négatif ou proche de zéro ne signifie pas que l’outil libère de la mémoire : il peut être inférieur aux variations de collecte, de compilation et de ramasse-miettes.

## Ce que le déchargement récupère dans ce test

Après chaque action, le banc attend trois secondes et ne force pas le ramasse-miettes. La séquence porte sur une session cumulée jetable.

| Action | Chromium : différence (Mio) | Firefox : différence (Mio) |
|---|---:|---:|
| Mettre l’éditeur en veille, arrêter le LSP | -115,9 ± 81,9 | -57,0 ± 0,2 |
| Décharger l’éditeur, retirer DOM et modèle | -0,2 ± 4,1 | -2,7 ± 0,2 |
| Masquer l’aperçu normalement | -17,7 ± 4,4 | -3,8 ± 0,3 |
| Retirer l’iframe (expérience du banc, pas le comportement de l’app) | +0,1 ± 0,1 | -0,3 ± 0,4 |
| Décharger la console SQL | -4,0 ± 7,9 | -14,7 ± 2,0 |
| Fermer le projet sans sauvegarde, fin du test | -202,6 ± 58,2 | -310,7 ± 3,2 |

La veille du service d’analyse peut rendre une part notable, mais avec une dispersion importante sous Chromium. Décharger le DOM ou masquer une vue ne garantit pas une restitution équivalente. Ces observations courtes ne promettent pas une baisse immédiate de RAM physique sur chaque machine.

## Compteurs WASM et stockage interne

Ces compteurs décrivent des sous-systèmes ; **il ne faut pas les additionner** à la mémoire résidente privée ci-dessus.

| Compteur observé | PHP sans SQL | PHP + `SELECT 42` | Campus installé |
|---|---:|---:|---:|
| Capacité mémoire WASM linéaire initiale | 256 Mio | 256 Mio | 256 Mio |
| Allocateur C occupé, Chromium | 0 | 72,93 Mio | 78,31 Mio |
| Allocateur C occupé, Firefox | 0 | 72,60 Mio | 73,95 Mio |
| Fichiers SQL logiques dans le VFS | 0 | 62,84 Mio | 65,61 Mio |
| Workers SQL créés | 0 | 16 | 16 |

Le rapport indique un plafond WASM effectif de 512 Mio. Les seize Workers partagent la mémoire linéaire WASM ; il ne faut pas multiplier 256 Mio par seize. Ils ont toutefois leurs propres contextes JavaScript, objets de runtime et piles. La capacité annoncée par WASM n’est pas de la RAM résidente.

L’inspection a trouvé 167 fichiers SQL : 65,61 Mio logiques et 65,66 Mio de buffers JavaScript non-WASM visibles. Les six plus gros représentent environ 62 Mio : `ibdata1` 12 Mio, `ibtmp1` 12 Mio, trois fichiers undo de 10 Mio chacun et le redo de 8 Mio. C’est nettement plus que les fichiers source du Campus.

Les Workers de langage annonçaient les capacités linéaires suivantes après le travail testé : PHPantom 11,75 Mio après analyse, 21,69 Mio après la sonde de complétion PDO ; SuperHTML 16,94 Mio ; TypeScript/SWC 3,06 Mio. Ces valeurs ne comprennent pas le tas JavaScript, le code compilé ni les objets du navigateur.

## Ce que les résultats suggèrent

1. **PHP seul reste coûteux**, car le build publié charge le module WASM fusionné PHP/MariaDB ; le SQL à la demande évite toutefois d’initialiser MariaDB et ses Workers tant qu’ils ne sont pas utilisés.
2. **Les services de langage sont un poste mesurable.** Garder l’édition et la coloration disponibles, puis rendre l’analyse sémantique plus explicitement activable et déchargeable est une piste à évaluer. Le gain d’une nouvelle architecture n’a pas encore été mesuré.
3. **Un mode fichiers statiques sans moteur** éviterait de créer le runtime à l’ouverture d’un projet statique. Un build PHP sans MariaDB pourrait aussi réduire le coût fixe ; les deux gains restent à mesurer.
4. **Le Campus retient un datadir important dans le VFS mémoire.** Étudier OPFS ou une autre stratégie de fichiers sans compromettre durabilité, récupération ni comportement SQL.
5. **Les paramètres SQL sont déjà réduits sur plusieurs axes.** InnoDB utilise un buffer pool de 16 Mio ; Aria et MyISAM ont un cache de 1 Mio chacun ; les threads I/O sont à lecture 1, écriture 2 et purge 1. Le pool de 16 Workers est utilisé dans les scénarios SQL observés. Une baisse supplémentaire doit passer par un rebuild et des tests de transactions, de reprise et de concurrence.
6. **Décharger les aperçus et vues pourrait aider**, mais le test n’a pas démontré que retirer une iframe rend davantage que masquer l’aperçu. Mesurer chaque changement sur des sessions identiques.
7. **Charger CodeMirror et les parseurs uniquement à l’ouverture** reste à évaluer : le code du studio importe actuellement CodeMirror au démarrage. Le formateur a terminé son Worker après usage dans l’application normale ; une mesure qui le garde actif ne décrit donc pas le coût permanent du produit.

Ces propositions ne sont pas des optimisations déjà réalisées ni des économies promises. Aucun objectif de RAM inférieur à 300 Mio n’est démontré pour un projet PHP + SQL.

## Protocole et limites

- Windows 11 Pro, noyau 10.0.26300, AMD Ryzen 7 7700, 16 processeurs logiques, 15,1 Gio de RAM.
- Un navigateur headless neuf et un profil vierge par scénario ; Chromium et Firefox mesurés séparément. Le total couvre les processus descendants du navigateur, mais exclut le serveur Node et le collecteur.
- Après disponibilité fonctionnelle : huit secondes de repos, puis sept instantanés espacés de 300 ms. Les étapes de fermeture attendent trois secondes et prennent cinq instantanés. Aucun ramasse-miettes forcé, aucun vidage du working set.
- Le Campus utilise le vrai moteur et ses données. Les tests HTML et JavaScript utilisent des documents synthétiques, car le Campus n’a pas de fichiers autonomes correspondants. Les demandes de complétion PDO sont également des sondes.
- La campagne a été interrompue après deux ou trois répétitions par configuration. Les deux mesures rejetées pour erreurs de lecture du collecteur ne sont pas incluses.
- La mémoire résidente privée exclut les pages partageables. La somme des working sets peut compter les pages partagées plusieurs fois. Ne pas comparer ces chiffres directement aux anciennes mesures PSS Linux, à la RAM d’un autre navigateur ou à la capacité du buffer WASM.

Les chiffres détaillés proviennent du rapport Windows fourni pour cette révision. Les fichiers JSON bruts associés à ce rapport ne faisaient pas partie du document transmis ; ils ne sont donc pas présentés ici comme artefacts téléchargeables.
