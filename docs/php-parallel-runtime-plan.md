# Exécuter plusieurs requêtes PHP en même temps dans un seul WASM

## Observation du runtime réel

- Un seul Web Worker propriétaire dans packages/runtime/src/native-worker.mjs.
- RequestQueue lance **une seule requête PHP à la fois**. Elle admet jusqu'à 32 demandes en attente, totalisant au maximum 8 Mio de corps.
- Le runner C stocke globalement request_state, les états de requête et les callbacks de sortie ; les callbacks EM_JS utilisent un seul objet Module.phpWasm.
- Le gestionnaire SQL a current_owner global : les connexions/rollbacks ne sont actuellement pas isolés entre threads PHP parallèles.
- PHP est déjà compilé avec ZTS et pthreads ; MariaDB utilise ses propres threads SQL. Cela permet de traiter du SQL pendant qu'un appel PHP attend, mais **pas deux scripts php_execute_script simultanément**.
- Le WASM actuel est limité à 512 Mio de mémoire linéaire, avec une pile pthread par défaut de 2 Mio et un pool SQL configurable (16 par défaut).

## Choix et estimation d'effort

| Option | Réalité technique | Estimation de travail | Décision |
| --- | --- | --- | --- |
| A. Garder PHP séquentiel, améliorer le traitement parallèle HTTP/JS et la file | Deux invités actifs mais un script PHP à la fois | **2 à 4 jours** | Priorité immédiate, sans risque SQL majeur |
| B. Introduire 2 puis 4 workers PHP pthread dans **la même instance WASM**, mémoire et MariaDB communes | Vraies exécutions PHP simultanées | **3 à 6 semaines** environ | À prototyper ; risque élevé sur PHP ZTS, SAPI et fichiers |
| C. Démarrer plusieurs instances WASM | PHP parallèle mais bases, mémoire et verrous duplicatifs | **2 à 5 semaines supplémentaires** pour centraliser la base et les fichiers | Déconseillé pour ALWIS |

### Option B : étapes

1. Prototype de **2 threads PHP** et mesure d'exécution réellement superposée (2–4 jours) : vérifier Asyncify, Zend ZTS et Emscripten pthreads.
2. Remplacer les états globaux request_state, environnements, sortie stdout/stderr, en-têtes, Module.phpWasm par un contexte dédié **à chaque requête/thread**, sans mélange des réponses (3–6 jours).
3. Transformer current_owner de MariaDB en identifiant propre au thread ; synchroniser le registre de connexions, les transactions et rollbacks, revoir checkpoints et locks InnoDB (3–5 jours).
4. Valider les fichiers, sessions PHP, verrous par session et sauvegardes OPFS/IDBFS en présence de requêtes actives (3–6 jours).
5. Ajouter scheduler limité à deux appels actifs, quotas mémoire, équité, délai max, annulation et arrêt propre ; passer éventuellement à quatre threads (3–5 jours).
6. Vérifier la concurrence réelle dans Chromium/Firefox : requêtes superposées, réponses et cookies non mélangés, SQL simultané, reprise après crash et mesure RAM (4–8 jours).

**Ordre de grandeur : 15 à 30 jours de développement et QA pour un résultat robuste**, plus si les appels Emscripten/Asyncify ou les extensions PHP ne sont pas compatibles avec l'exécution multi-pthread. Une étude de faisabilité coûte 2 à 4 jours, sans garantie.

Les tests actuels prouvent la concurrence des **invités et de leur transport**, pas celle des scripts PHP. Conserver le WASM séquentiel validé comme base ; faire le prototype derrière un flag et ne l'activer ni pour les projets persistants ni dans une release avant les tests d'intégrité.
