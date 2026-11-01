# Profil du moteur fusionné

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node benchmarks/native/memory.mjs profile-name
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node tests/browser/load-native.mjs
```

Un navigateur neuf par profil/navigateur. `memory.mjs` distingue capacité linéaire WASM, usage de l'allocateur C lorsqu'instrumenté et PSS/RSS globale des descendants Playwright. La lecture PSS peut être indisponible si un processus apparaît/disparaît pendant l'échantillon ; conserver `null` et sa raison. Les étapes sont PHP seul, démarrage SQL, 100 requêtes sur 1 000 lignes, arrêt SQL et destruction du Worker. Aucune collecte forcée JS ni attente de stabilisation mémoire n'est imposée. Ce sont des points d'observation, pas des pics continus ni un benchmark statistique.

## Observations du 31 octobre 2026

| Navigateur | Profil initial : capacité / PSS au travail SQL | Profil réduit borné : capacité / PSS au travail SQL |
|---|---|---|
| Chromium 156 | 737,75 / 1 041,69 Mio | 256 / 574,23 Mio |
| Firefox 157 | 732,94 / 1 224,39 Mio | 256 / 736,62 Mio |

Les JSON complets sont sous `benchmarks/receipts/native-memory/`. Le profil intermédiaire de piles pthread 2 Mio atteint 626,38 Mio de capacité : il ne suffisait pas. Le profil final réduit InnoDB (pool et maximum 16 Mio), Aria/MyISAM (1 Mio chacun), redo (8 Mio), tables temporaires/buffers, paquets et piles pthread. Le tas C occupé observé après le travail vaut environ 74,47 Mio. La limite maximale de croissance du module final est 512 Mio ; la capacité du scénario reste à 256 Mio. Elle peut augmenter sur d'autres projets.

Les capacités initiales « environ 740 Mio » provenaient d'un autre scénario de fixtures ; elles ne sont pas exactement les 737,75/732,94 Mio de ce protocole. Les versions de code ont aussi évolué entre ces observations : ne pas attribuer tout écart de performance à une seule option. Latences indicatives p50/p95 du scénario final : Chromium 1,71/4,06 ms et Firefox 1,76/3,16 ms. Une seule série ne définit pas la capacité générale du produit.

**La cible de moins de 300 Mio n'est donc satisfaite ici que pour la capacité linéaire de ce scénario, pas pour la RAM globale du navigateur.** Le JavaScript, les Workers auxiliaires, caches/JIT et VFS ont leur propre coût. Après arrêt SQL, les allocations C retombent vers 6 Kio, mais la mémoire linéaire ne rétrécit pas et aucune restitution immédiate de RAM navigateur n'est démontrée. L'arrêt SQL reste nécessaire à la sauvegarde propre ; son intérêt comme optimisation de RAM n'est pas acquis.

## Limites renforcées et limites restantes

Le protocole embarqué généré refuse avant collecte complète un jeu dépassant son budget de blocs de résultat (16 Mio) ou 10 000 lignes. Les contrôles de copie PHP/console restent en place. Les tests provoquent ces refus via PDO émulé/natif, bufferisé/non bufferisé, MySQLi direct/préparé et console ; ils vérifient ensuite une nouvelle requête sur la même connexion. Les tris/jointures et expressions peuvent encore avoir leurs propres allocations de travail. Le plafond de 512 Mio borne la mémoire linéaire totale, pas toute la RAM du navigateur.

Les appels RPC sont aussi bornés avant postMessage, y compris la somme des messages en attente. Les [quotas VFS/temp/SQL et de repli](../../packages/runtime/RESOURCE-LIMITS.md) sont désormais appliqués sous les appels POSIX et vérifiés. Restent à approfondir : erreurs de disque plein InnoDB, échecs d'allocation extrêmes, longues sessions, cycles répétés, mesure continue des pics et comparaison de profils sur plusieurs applications.

Le scénario de charge sous `benchmarks/receipts/native-load/` exécute deux clients, chacun à 5 puis 10 requêtes/s offertes avec une seule en vol, pendant dix secondes par palier. Sessions et compteurs SQL sont vérifiés sur les deux navigateurs. Ce scénario court ne prouve pas l'absence de fuite sur plusieurs heures et ne remplace pas un test à plus de fenêtres.

Au premier palier Chromium, cinq départs par client ont été retardés de plus d’un intervalle, incluant le démarrage SQL à froid ; les réponses sont toutes vérifiées, mais ce palier ne démontre pas une cadence uniforme. Le palier 10 req/s et les deux paliers Firefox n’ont pas ce retard selon le critère du harness. Les latences brutes et décomptes sont conservés.

Après ajout des tables système officielles et des APIs MySQLi (profil `system-tables`), le même scénario reste à 256 Mio de capacité sur les deux navigateurs, avec environ 74,8 Mio occupés dans l’allocateur C. Les observations PSS au travail SQL sont alors 654,19 Mio (Chromium) et 741,63 Mio (Firefox) ; les variations entre passages illustrent pourquoi une série isolée ne prouve pas un pic ou un gain physique constant. Les JSON sont conservés séparément.

## Refus SQL : fuite reproduite puis corrigée — 1 novembre

Une sonde a mis en évidence une fuite par résultat excessif refusé : environ 16,6 Mo supplémentaires restaient dans l'allocateur C à chaque erreur, même après fermeture de la connexion. Après cinq refus console puis cinq PDO, l'occupation passait d'environ 78,3 à 244,3 Mo et la capacité atteignait 307,25 Mio. Le reçu d'échec est conservé sous `benchmarks/receipts/failures/result-refusal-allocation-growth.json`.

La cause est `embedded_get_error()` dans la version MariaDB épinglée : `my_free(data)` ne libère que l'enveloppe, alors que le protocole peut désormais arriver en erreur après une collecte partielle. L'adaptateur généré appelle `free_rows(data)`, qui libère aussi le MEM_ROOT, et retire l'alias de métadonnées devenu invalide. Les sources amont restent intactes.

Après correction, le parcours natif complet mesure six refus successifs par voie : delta d'occupation C **0 octet console dans les deux navigateurs**, **16 octets PDO Chromium / 0 Firefox**, après le premier échantillon. Les mêmes fixtures conservent erreurs, types, récupération et sauvegarde/restauration. Même après pression de 128 handles natifs et réservations SQL proches de 16 Mio, la capacité reste à **256 Mio** ; l'occupation après le parcours complet est environ **76,02 Mio**. Les compteurs natifs de préparation reviennent à zéro après le script PHP.

Le profil froid supplémentaire `statement-cleanup` conserve le protocole existant : capacité 256 Mio, occupation C au travail 68,75 Mio (Chromium) / 74,79 Mio (Firefox), PSS globale observée **654,82 / 743,06 Mio**. p50/p95 des 100 requêtes : 1,72/4,18 ms et 1,70/2,46 ms. Ce passage ne démontre toujours ni un pic garanti ni moins de 300 Mio de RAM navigateur ; l'amélioration établie ici est la suppression de la croissance de 16 Mio par refus. Les traces avant/après et les JSON bruts sont distincts des profils historiques.
