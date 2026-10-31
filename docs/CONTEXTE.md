# Contexte consolidé — 31 octobre 2026

> Cadrage actualisé : voir [l’objectif actif](EXECUTION.md). N fenêtres avec sessions indépendantes ou partagées ; WASM unique PHP/MariaDB comme cible principale ; SQL à la demande et déchargement évalué sur mesures. Les scénarios à deux joueurs ci-dessous sont des tests, pas une limite produit.

## Besoin utilisateur

Importer de petits projets scolaires PHP/HTML/CSS/JS et un dump SQL, conserver leurs appels PDO et MySQLi usuels, puis servir leurs pages dans le navigateur. La cible est une vraie MariaDB embarquée avec transactions, pas une VM x86 : cette voie a déjà été essayée et rejetée pour son coût.

Deux joueurs locaux doivent disposer de sessions distinctes, mais partager un unique environnement PHP/SQL. Une fenêtre indépendante permet de lancer du SQL, éditer les données et manipuler un schéma relationnel dynamique. L'interface de gestion doit être en JavaScript et légère. La priorité reste la mémoire, sans sacrifier les extensions PHP essentielles ni les comportements usuels.

## Sources et chronologie

Deux traces complémentaires sont conservées sans réécrire leurs propos :

- [`conversation-source.md`](../provenance/conversation-source.md) : export Markdown de la conversation du 30 octobre.
- [`conversation-complementaire.txt`](../provenance/conversation-complementaire.txt) : texte ajouté pendant l'import ; il comprend aussi la demande de refaire les dernières actions après la perte des fichiers et l'annonce de leur reconstruction.

| Moment de la conversation | Contexte à retenir |
|---|---|
| 30/10 19:16 | Recherche large PHP/MySQL WASM et comparaison des raccordements |
| 30/10 20:13 | VM x86 écartée ; projets scolaires, PDO/MySQLi, deux joueurs, performance |
| 30/10 21:29 | Préférence explicite pour une extension SQL native ; stockage léger ; comparaison des WASM séparés/fusionnés ; éditeur relationnel JS |
| 30/10 21:41 | Réutiliser le routage et les échanges existants plutôt que tout réinventer |
| 30/10 21:43–21:56 | Mémoire prioritaire ; polling, WordPress et budgets à éprouver |
| 30/10 21:58 | Étude du dossier PC et de ses permissions/conflits |
| 30/10 22:01 | Dossier PC reporté ; préparer le projet et regrouper les références |
| 30/10 22:13 | Télécharger les sources, mapper le code, structurer étapes et difficultés |
| 31/10, reconstruction | Refaire les fichiers perdus ; résultat fourni dans les deux ZIP |
| 31/10, import actuel | Sauvegarder sur WASMWebServer et consolider aussi le texte complémentaire |

## Arbitrages qui remplacent les premières suggestions

La première réponse proposait une compatibilité MySQLi écrite en PHP. La demande de 21:29 fixe ensuite une adaptation compilée native : **le shim PHP n'est pas le plan retenu**. Le pont PDO est un point de départ ; disposer de MySQLi compilé ne suffit pas à le brancher sur l'API embarquée.

Le Service Worker route le HTTP. Le studio possède les Dedicated Workers et reste ouvert. Il ne faut pas faire dépendre la durée de vie de la base de celle du Service Worker. Un seul propriétaire par projet, cookies virtuels distincts par joueur et connexions SQL distinctes pour PHP et la console.

OPFS sans miroir intégral reste une cible à prototyper et à comparer à IDBFS incrémental. L'historique mentionne des essais OPFS amont plus lents : « OPFS » ne vaut pas preuve d'accélération. La fusion PHP/MariaDB reste une expérience après un témoin séparé reproductible.

Le premier build suit les versions compatibles du bridge, pas les HEAD PHP/Emscripten collectés pour l'étude. La mémoire et les ABI se changent après avoir reproduit le test amont.

## Cible fonctionnelle et limites

- V1 : petits CRUD, formulaires, sessions, uploads, pages et endpoints PHP ; deux joueurs locaux et console sur la même base.
- Console : SQL, historique borné, résultats paginés, erreurs, durée ; édition de lignes par clé primaire.
- Diagramme : tables/colonnes/index/relations depuis `information_schema` et `SHOW CREATE TABLE`. Déplacer une table change une position ; relier des colonnes propose un DDL réel, puis réintrospecte après exécution.
- Deux appareils : transport vers un navigateur hôte à étudier ultérieurement ; aucune réplication implicite d'IndexedDB.
- Dossier PC : V2. Le texte apporte les besoins de cache limité, permissions renouvelables, écritures ordonnées, détection de conflits et revalidation au retour au premier plan ; aucun de ces éléments n'est implémenté.
- WordPress : test de compatibilité ultérieur ; le succès de Playground/SQLite ne prouve pas celui de ce montage MariaDB/MySQLi.
- « Boogie » : projet non identifié dans les pièces disponibles ; aucune compatibilité ne peut être déduite.

## Chiffres à ne pas transformer en promesses

Les fourchettes historiques varient selon les scénarios : 150–300 Mo pour un petit projet, 200–350 Mo pour deux joueurs, 250–450 Mo avec gestion SQL, 300–600 Mo pour WordPress simple ; d'autres réponses provisionnent 256–768 Mo ou 350–600 Mo avec les builds peu modifiés. **Aucune n'est une mesure de WASMWebServer.** L'objectif de moins de 300 Mio sur une petite fixture doit être vérifié avec une méthodologie et une unité explicites.

De même, 1–10 ms par petite requête était une hypothèse. Les benchmarks Wasmtime cités dans la conversation ne décrivent pas le navigateur. La cible de validation est deux joueurs à 5 puis 10 requêtes/s chacun, une requête en vol par joueur, sans accumulation durable. Le temps à mesurer comprend PHP, sessions, SQL, messages et réponse.

Les comptes historiques 15 dépôts/57 repères/7 puis 8 tests concernent les fichiers perdus. Les ZIP actuels contiennent **17 dépôts principaux, 2 sous-modules, 81 repères et 14 tests**. On repart de ces fichiers vérifiables, pas des anciens comptes.

## Prochaine action de développement

Reproduire le témoin PDO PHP+MariaDB du bridge, conserver versions/commandes/logs, puis mesurer une fixture. Ensuite isoler le nettoyage des connexions par propriétaire et comparer les deux stratégies MySQLi natives. Les critères et lots détaillés figurent dans [ROADMAP](ROADMAP.md) et [REPRISE](REPRISE.md).
