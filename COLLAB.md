# ALWIS — mode multi-utilisateur (édition serveur uniquement)

## Lot 1 — Base (ce zip)
- `server/collab-hub.mjs` : WebSocket maison (RFC 6455, sans dépendance), salles, places avec **délai de reprise**
  (la place d'une personne déconnectée est gardée `graceMs`, reprise par jeton, puis libérée),
  signalisation WebRTC, **relais limité** (seau de jetons par salle), plafond d'invités (6 par défaut),
  verrouillage, expulsion, battements de cœur, limites par IP et globales. Rien n'est stocké.
- `server/server.mjs`, `server/Dockerfile`, `server/server-config.html` : route `/collab`, `/api/collab/config`,
  réglages dans `/admin/server` (activation, invités/session, délai de reprise, débit du relais, sessions max).
- `apps/studio/collab/` : couleurs déterministes (doublon de nom → teinte décalée), transport
  (signalisation avec reconnexion + jitter, lien P2P → repli relais), session, interface de présence
  (pastilles superposées, fenêtre d'invitation, bandeaux de reprise, écran de saisie du nom, chargement).
- En-tête : pastilles + bouton à droite du bouton de thème (`#collabSlot`). Rien n'apparaît sur l'édition statique.
- `apps/studio/editor/collab-sync.mjs` : synchronisation de texte par deltas (hôte = autorité) — testée.
- Tests : `tests/collab-hub.test.mjs`, `collab-session.test.mjs`, `collab-sync.test.mjs` (110/110 tests du dépôt passent).

## Installation
Décompresser à la racine du dépôt (les chemins sont ceux du dépôt), puis `npm test`.
Variables utiles : `ALWIS_COLLAB=false`, `ALWIS_COLLAB_MAX_GUESTS`, `ALWIS_COLLAB_GRACE_SECONDS`,
`ALWIS_COLLAB_RELAY_KBPS`, `ALWIS_ICE_SERVERS` (JSON, ex. un serveur TURN). Derrière un proxy : relayer l'en-tête
`Upgrade` pour `/collab` et mettre `TRUST_PROXY=true`.

## Lot 2 — Avancé
- `apps/studio/editor/collab-extension.mjs` + `codemirror.mjs` : curseur coloré (avec étiquette au survol), sélection colorée,
  fond coloré ~4 s sur le texte distant tout juste saisi ; les remplacements de document (changement de fichier) ne sont jamais des modifications.
  Testé dans jsdom.
- `apps/studio/collab/docs.mjs` : synchronisation par deltas, hôte = autorité ; **rattrapage après coupure** (`sync`) sans doublon,
  y compris quand l'accusé de réception s'est perdu. Test de charge aléatoire avec reconnexion au milieu.
- `apps/studio/collab/rpc.mjs` : l'invité appelle `fs.*` / `db.*` / `sessions.list` sur le moteur de l'hôte, résultats découpés
  en morceaux, binaires et BigInt gérés, liste blanche, 6 appels simultanés max par invité, délai d'attente.
  Le moteur de l'invité est remplacé le temps de la session puis restauré : explorateur, données, structure et schéma fonctionnent sans modification des vues.
- `apps/studio/collab/focus.mjs` : pastilles dans l'explorateur, contour coloré des cellules et lignes de structure, ligne en cours de saisie
  (données), trait de relation en cours de tracé (schéma), curseur de souris et clic rejoué sur l'aperçu (côté hôte).
- `apps/studio/collab/wire.mjs` : branchement hôte et invité sur l'application (requêtes SQL partagées, résultats diffusés,
  chargement des fichiers à la demande, écrans de chargement, enregistrement par l'invité écrit chez l'hôte).
- `docs/collab-preview.html` : aperçu visuel statique (ouvrir dans un navigateur).
- Hooks ajoutés : `engine.emit` (services.mjs), `editor.path()` et évènement `alwis:editor` (ui.mjs).
- 120 tests du dépôt passent.

## Lot 3 — Finalisé
- `apps/studio/collab/preview.mjs` : l'aperçu web de l'hôte est recopié chez les invités (instantané sans scripts, feuilles de style
  intégrées, renvoyé quand la page change) ; pointeurs et clics partagés via `focus.mjs`, le clic est rejoué dans la vraie page côté hôte.
- Correction trouvée par les tests : la ligne « en cours de saisie » d'un autre utilisateur n'était pas retirée à son départ.
- `GET /api/collab/config` et WebSocket `/collab` vérifiés contre le vrai `server.mjs` (hôte + invité, variantes de couleur pour deux noms identiques).
- 122 tests du dépôt passent (dont 22 nouveaux : hub, session, synchronisation, extension CodeMirror, RPC, présence).

## Ce qui n'a PAS pu être vérifié ici (à essayer dans un vrai navigateur)
Je n'avais pas de navigateur : le câblage `wire.mjs` sur les vues existantes (explorateur, données, structure, schéma, aperçu) repose sur la lecture
du code et sur des tests jsdom, pas sur l'application lancée. À contrôler en priorité :
1. Reconstruire l'éditeur (`npm run editor:build`) : `codemirror.mjs` embarque maintenant l'extension collab.
2. Deux onglets (un hôte, un invité via le lien) : ouverture d'un fichier, frappe croisée, curseurs, changement d'onglet pendant qu'on reçoit des modifications.
3. Couper le réseau d'un invité (outils de développement → hors ligne) : la place doit rester réservée `graceMs`, puis être reprise ou libérée.
4. WebRTC : sans TURN, certains réseaux d'entreprise forcent le relais (débit limité, c'est voulu). Ajouter un TURN via `ALWIS_ICE_SERVERS`.
5. Limites connues : la ligne de structure en cours de création n'est pas encore affichée (seul le surlignage de la ligne l'est) ;
   l'aperçu invité est un instantané (pas de JavaScript, images relatives non recopiées) ; les messages restent en texte JSON (pas de binaire).
