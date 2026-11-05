# ALWIS — Instructions pour la collaboration, le P2P et le déploiement Docker

Date : 5 novembre 2026.

Statut : spécification de réalisation. Ce document décrit une fonctionnalité à implémenter ; il ne certifie pas sa présence dans le produit. Les exemples de déploiement sont des bases à compléter et à tester, pas un service déjà installé.

## 1. Objectif et décisions retenues

Ajouter à ALWIS un atelier collaboratif rejoignable par lien. Plusieurs personnes peuvent modifier les mêmes fichiers et partager les outils SQL, le schéma et certains aperçus. Préserver le design actuel, CodeMirror, Emmet, les snippets, les diagnostics, les thèmes et les protections existantes.

Décisions :

- Six participants au maximum par partage, hôte compris.
- Quarante participants actifs au maximum sur l'ensemble du service, hôtes compris.
- Budget mémoire des services collaboratifs : au maximum 1 Gio au total, réparti explicitement entre conteneurs.
- Quatre Gio au maximum de fichiers temporaires sur le serveur. Les fichiers principaux restent dans le navigateur de l'hôte.
- Édition collaborative avec Yjs et CodeMirror 6 ; ne pas inventer un algorithme de fusion.
- WebSocket pour invitations, contrôle, présence, édition et commandes.
- WebRTC DataChannel pour les fichiers, direct en priorité, TURN en secours.
- STUN avec limites généreuses et protection contre les abus ; trafic TURN limité plus strictement.
- SQLite pour les partages et métadonnées persistantes.
- Une instance Node.js au départ. Pas de Redis ni de base MariaDB supplémentaire sur le serveur collaboratif.
- PHP et MariaDB du projet continuent à s'exécuter dans le navigateur de l'hôte.
- Configuration par variables d'environnement et écran d'administration protégé pour les réglages autorisés.
- Aucun déploiement, secret, publication ou changement de branche n'est autorisé par la seule lecture de cette spécification.

Les valeurs supplémentaires proposées plus bas sont des réglages initiaux à mesurer. Elles ne constituent pas une garantie que le serveur actuel supportera quarante participants en activité intensive.

## 2. Architecture

```text
                      HTTPS / WSS
Navigateurs ────────────────────────── Reverse proxy existant
    │                                           │
    │                                    Node.js + Yjs
    │                                    ├── SQLite
    │                                    └── cache temporaire disque
    │
    ├── WebRTC direct : hôte ↔ invités, fichiers à la demande
    │
    └── Si connexion directe impossible : coturn, relais sans stockage durable

Navigateur hôte : OPFS + fichiers du projet + runtime PHP/MariaDB
Navigateurs invités : OPFS limité + fichiers reçus + éditeurs collaboratifs
```

Ne pas confondre :

- STUN découvre les possibilités de connexion ; il ne transporte pas les médias du projet.
- TURN relaie les paquets lorsque le direct échoue ; il n'enregistre normalement pas les fichiers.
- Le cache serveur de 4 Gio est un mécanisme distinct et facultatif pour une reprise ou un transfert différé.
- SQLite conserve des métadonnées ; il ne remplace pas le stockage de tous les projets.
- Yjs synchronise les textes ; il ne sert pas à transmettre une vidéo ni une base SQL complète.

Le service doit rester indépendant de l'interface : intégrer un client collaboratif dans ALWIS plutôt que remplacer ses services existants. Charger les dépendances de collaboration à la demande lorsque possible.

## 3. Identités, participants et permissions

### 3.1 Entrée dans un partage

L'hôte clique sur « Partager », choisit un nom, les permissions, l'expiration et crée un lien révocable. L'invité saisit un pseudo, voit les droits proposés et rejoint la salle. Prévoir une validation manuelle par l'hôte en option.

Le pseudo n'est pas une identité de sécurité. Utiliser un identifiant de participant distinct, une session authentifiée et des jetons imprévisibles. Stocker une empreinte des invitations, pas leur secret brut. Échanger le lien contre une session puis retirer le secret de l'URL ; ne pas le conserver dans les journaux ou le referrer.

Une limite globale par humain ne peut pas être garantie avec de simples pseudos. Le quota porte sur les identités de participation autorisées. Un participant présent dans deux salles consomme une place dans chacune ; totaliser les participations pour garder le calcul prévisible. Les onglets d'une même participation ne doivent pas multiplier les places, mais restent soumis à une limite de connexions.

### 3.2 Rôles

| Permission | Lecteur | Éditeur | Hôte |
|---|---|---|---|
| Lire les fichiers partagés | Oui | Oui | Oui |
| Modifier le code | Non | Oui | Oui |
| Exécuter PHP / SQL | Selon autorisation explicite | Selon autorisation explicite | Oui |
| Modifier données / structure SQL | Non par défaut | Permission dédiée | Oui |
| Créer, renommer, supprimer des fichiers | Non | Selon autorisation | Oui |
| Inviter / exclure / révoquer | Non | Non par défaut | Oui |
| Sauvegarder durablement le projet hôte | Non | Demander | Oui |

Vérifier les droits sur chaque commande côté serveur et côté runtime hôte. Masquer un bouton ne constitue pas une autorisation.

### 3.3 Comptage et départ

Réserver les places atomiquement dans une transaction SQLite courte. Refuser explicitement le septième participant ou la quarante-et-unième participation globale. Empêcher le contournement par connexions parallèles.

Conserver une grâce de reconnexion de 30 secondes, réglable. Distinguer place réservée et socket ouverte. Un heartbeat et un bail déterminent l'état connecté ; les lignes historiques SQLite ne prouvent pas la présence actuelle.

Après redémarrage serveur, réévaluer les baux et réauthentifier les clients. Éviter de supprimer immédiatement toutes les participations et d'autoriser un double comptage pendant leur reprise.

## 4. Interface et présence

### 4.1 Barre supérieure droite

- Avatars des participants avec première lettre du pseudo ; compteur et menu de débordement sur petit écran.
- Couleur stable calculée à partir du pseudo normalisé, adaptée aux thèmes clair et sombre.
- Identité technique séparée ; distinguer les homonymes par un suffixe ou motif sans rendre leur couleur illisible.
- États : connecté, inactif, reconnexion, hôte absent.
- Au clic : pseudo, rôle, fichier ou outil courant, « Ouvrir son emplacement », « Suivre », « Arrêter de suivre ».
- Actions hôte : changer les permissions, exclure, révoquer les invitations, fermer le partage.

Ne pas modifier l'avatar ou la couleur à chaque reconnexion. Contrôler les caractères et la longueur du pseudo, échapper tout affichage.

### 4.2 Éditeur de code

- Curseur de saisie distant en barre verticale colorée et pseudo temporaire.
- Sélection distante avec fond translucide ; la sélection locale reste native.
- Ajout ou collage distant surligné brièvement dans la couleur de l'auteur, puis disparition progressive (environ 2 secondes, configurable).
- Surlignage attaché aux positions du document, pas aux coordonnées écran.
- Marqueurs hors écran discrets et option « suivre » ; ne pas déplacer spontanément le curseur local.
- Indiquer « consulte », « modifie », « modifications en cours », sans simuler un verrou exclusif sur le texte.
- Les changements de formatage importants affichent leur auteur et restent annulables.

Conserver complétion, snippets, Emmet, diagnostics, signatures, formatage et raccourcis actuels. Les transactions de ces fonctions doivent traverser l'intégration collaborative, sans remplacement complet injustifié du fichier.

### 4.3 Explorateur

- Afficher un ou plusieurs petits avatars à la fin de la ligne du fichier consulté.
- Distinguer consultation et édition ; afficher les noms au survol et au clavier.
- Badge de téléchargement / indisponibilité pour un fichier pas encore reçu.
- Synchroniser créations, renommages et suppressions par commandes validées.
- Si un fichier ouvert est supprimé ou remplacé, préserver le brouillon local et proposer récupération / export.
- Conserver les détails du design : icônes, badges, menus, petits boutons d'ajout, drag-and-drop et navigation entre outils.

### 4.4 Pointeurs et accessibilité

Dans le schéma et les aperçus : flèche pleine semblable à l'image de référence, couleur du participant, contour contrasté, pseudo temporaire. Dans le code : barre verticale d'écriture.

Prévoir navigation clavier, noms accessibles, contraste dans les deux thèmes, réduction des animations et option pour masquer les pointeurs. Ne jamais utiliser seulement la couleur pour indiquer un conflit ou un état critique.

## 5. Code collaboratif et annulation

Utiliser un document Yjs par fichier texte actif, identifié par un identifiant de fichier stable. Le chemin peut changer sans changer cette identité. Ne pas charger tous les documents du projet à la création d'une salle.

- Initialiser le texte une seule fois ; empêcher les doublons lorsque plusieurs clients ouvrent simultanément un fichier neuf.
- Synchroniser par mises à jour binaires et vecteurs d'état ; ne pas transmettre le fichier complet à chaque frappe.
- Configurer `Y.UndoManager` pour ne suivre que les origines locales pertinentes.
- Ctrl+Z / Ctrl+Maj+Z concernent les modifications de leur auteur, pas un historique global partagé.
- Grouper correctement un collage, un snippet, une correction ou un formatage.
- Les curseurs utilisent des positions relatives compatibles avec les éditions concurrentes.
- La fermeture d'un onglet ne doit pas perdre ses changements non confirmés.
- Les clients gardent une copie de secours locale pour reprendre après déconnexion.
- Évincer les documents inactifs après synchronisation et snapshot ; borner aussi l'historique interne CRDT et l'annulation.

Git sert éventuellement aux points de sauvegarde et à la comparaison de versions, pas au transport des frappes. Une copie durable du fichier n'équivaut pas à un journal complet d'auteur ou à un commit.

### 5.1 Garanties et reprise

Afficher séparément :

1. « Local uniquement » : changement pas encore confirmé.
2. « Synchronisé » : reçu par le mécanisme de synchronisation.
3. « Enregistré chez l'hôte » : texte écrit dans le stockage du projet.
4. « Sauvegarde exportée » : archive explicitement produite.

Définir précisément les accusés de réception. Une réception réseau ne garantit pas une écriture durable. Conserver un journal Yjs borné et des snapshots dans SQLite ou des fichiers dédiés, selon les mesures ; prévoir des quotas distincts de ceux des médias temporaires. Nettoyer les sessions expirées et permettre un export avant fermeture.

Sur interruption : reconnexion avec backoff et aléa, nouvelle authentification, resynchronisation Yjs, restauration de la présence. Ne pas rejouer une commande SQL à partir d'une simple file réseau sans déduplication.

## 6. Stockage et fichiers à la demande

### 6.1 Catalogue

Partager d'abord chemin, identifiant stable, taille, type, version et empreinte lorsque disponible. Ne pas calculer immédiatement les empreintes de tous les gros médias à l'ouverture du partage : les calculer progressivement et les mettre en cache.

Le catalogue n'accorde pas automatiquement l'accès aux fichiers exclus. Protéger les chemins sensibles, éviter les traversées de dossiers et vérifier les droits à chaque demande.

### 6.2 OPFS

L'hôte conserve les fichiers dans son stockage navigateur ; les invités utilisent un cache OPFS borné avec éviction des versions inutilisées. Les fichiers ouverts, modifiés ou pas encore sauvegardés ne sont pas évincés silencieusement.

Ne pas charger les médias dans le VFS en RAM de PHP par défaut. Réutiliser l'architecture de stockage disque de l'application et ses interfaces, après vérification de leur état réel.

Le navigateur utilisera toujours de la mémoire pour décoder une image, une vidéo et traiter les blocs. L'objectif est une consommation bornée indépendante du volume total du projet.

### 6.3 Import et export

ZIP et dossiers : lire les métadonnées, proposer les exclusions, décompresser progressivement vers OPFS. Préserver la sélection utilisateur, les protections de chemins, les limites de décompression et les erreurs compréhensibles. Ne pas garder toute l'archive décompressée dans Yjs ou dans un tableau JavaScript.

Exporter progressivement les fichiers et la base selon les fonctions existantes. Une collaboration ne remplace pas une sauvegarde ; OPFS peut être supprimé avec les données du site.

### 6.4 Transfert WebRTC

Topologie initiale en étoile : hôte ↔ invités, au maximum cinq invités par partage. Éviter un maillage complet inutile.

Protocole à prévoir :

- Identifiant de transfert, fichier et version, taille, autorisation, expiration.
- Blocs ordonnés et accusés de progression ; offsets vérifiés et aucune confiance dans les tailles annoncées.
- Commencer avec des messages de 16 à 64 Kio, en respectant `RTCSctpTransport.maxMessageSize` et les contraintes des navigateurs. Un bloc logique plus grand peut être fragmenté.
- Utiliser `bufferedAmount` et `bufferedamountlow` pour ne pas saturer le DataChannel.
- Écriture progressive dans OPFS, validation de la taille et de l'empreinte finale avant publication.
- Reprise d'une version immuable, annulation, expiration et nettoyage des fichiers partiels.
- Limiter les transferts simultanés et appliquer une équité entre invités.
- Pour les médias, permettre des demandes de plages d'octets plutôt que le téléchargement systématique du fichier complet.

Le trafic direct ne consomme pas le débit du relais serveur, mais cinq copies consomment cinq fois les octets sur la connexion montante de l'hôte. Ne jamais le qualifier de gratuit ou illimité pour les appareils.

### 6.5 Cache temporaire serveur

Facultatif pour une reprise ou un envoi différé. Stocker par identifiant imprévisible, avec version, empreinte et propriétaire ; ne jamais exposer un répertoire public.

- Plafond global de 4 Gio incluant tous les fichiers partiels et toutes les réservations.
- Réserver atomiquement la taille avant de recevoir ; plafonner aussi la taille réellement écrite.
- Dédupliquer seulement entre personnes autorisées au même contenu ; ne pas révéler l'existence d'un fichier privé.
- Libérer après utilisation ou expiration. L'expiration d'une URL ne supprime pas les octets.
- Ne pas promettre un fonctionnement sans hôte : le cache n'est pas nécessairement une copie complète du projet ni du runtime SQL.

## 7. WebRTC, STUN et TURN

### 7.1 Choix de transport

Configurer ICE pour essayer les routes autorisées et permettre le direct en priorité, avec TURN de secours. Ne pas forcer `iceTransportPolicy: "relay"` en usage normal. Prévoir cette option pour les tests et, éventuellement, un mode de confidentialité qui évite d'exposer les adresses aux autres pairs au prix d'un trafic relayé.

Identifier le chemin réellement utilisé via les statistiques WebRTC ; l'interface peut afficher « direct », « relais » ou « connexion ». Le serveur TURN fournit les compteurs de consommation de référence ; une déclaration du navigateur ne suffit pas pour la facturation ou les quotas.

### 7.2 Sécurité coturn

- Authentification par identifiants temporaires signés émis par Node.js, secret partagé uniquement côté serveur.
- Durée courte des identifiants, renouvellement pour les sessions longues et procédure de révocation adaptée aux allocations existantes.
- Configurer le realm, le certificat, les adresses d'écoute et l'adresse publique / correspondance NAT.
- Interdire les destinations loopback, privées, link-local, multicast et réseaux internes pertinents, y compris IPv6 ; tester ces restrictions.
- Désactiver les interfaces administratives non utilisées et ne pas publier leurs ports.
- Ne pas faire confiance au pseudo pour limiter les allocations : utiliser une identité technique liée à la participation.
- Réserver un nombre limité d'allocations par participant et globalement ; une connexion peut requérir plusieurs allocations pendant la négociation.

### 7.3 Limites de trafic

STUN : plafond élevé mais non nul, protection contre les floods et contrôle réseau. Direct : contrôle côté client de la concurrence et du débit de l'hôte. TURN : débit par allocation, capacité globale, nombre d'allocations et volume cumulé surveillés.

Exemple de budgets de départ, à valider :

| Paramètre | Proposition |
|---|---:|
| Débit relayé cumulé du service | 5 Mio/s |
| Budget relayé par participation | 1 Mio/s, agrégé entre ses allocations |
| Volume relayé par jour, global | 10 Gio |
| Volume relayé par jour, participation | 1 Gio |
| Allocations simultanées par participation | 4 |
| Allocations simultanées globales | 160 |

Ces chiffres ne sont pas des options coturn toutes disponibles directement. Vérifier les unités, les sens de trafic, la version et les possibilités exactes de `max-bps`, `bps-capacity`, `user-quota` et `total-quota`. Les identifiants temporaires renouvelés peuvent contourner un compteur par nom d'utilisateur : agréger selon l'identité de participation.

Les budgets cumulés par salle / participant nécessitent un collecteur fiable et une logique applicative. Arrêter de délivrer de nouveaux identifiants ne coupe pas forcément les allocations déjà actives. Implémenter leur terminaison ou appliquer une règle réseau appropriée. Pour une limite réseau stricte, utiliser un mécanisme hôte adapté ; Docker CPU/RAM ne limite pas le débit. Une limite basée sur des mesures périodiques comporte un dépassement possible, à documenter.

Si le budget TURN est épuisé : conserver le direct, afficher une erreur précise pour les connexions nécessitant le relais et proposer de réessayer. Ne pas annoncer un transfert réussi et ne pas basculer sans contrôle vers un relais WebSocket sans quota.

## 8. Partage de PHP, SQL et données

### 8.1 Autorité du runtime

Un seul runtime hôte est autorité pour PHP/MariaDB. Les invités envoient des commandes autorisées, identifiées et versionnées. Les écritures passent par une file contrôlée ; les commandes destructrices et les transactions ne s'entrelacent pas arbitrairement.

Une commande a un identifiant, auteur, contexte, état et résultat. En cas de perte de connexion après exécution, rechercher son résultat avant tout nouvel envoi. Si le résultat d'un effet de bord est incertain, l'indiquer et demander vérification plutôt que promettre une exécution « exactement une fois » impossible à garantir après certains crashs.

Autoriser l'édition et l'exécution PHP peut donner accès aux fichiers et données du runtime. Une liste de fichiers masqués dans l'explorateur ne constitue pas un cloisonnement. Préférer un projet de collaboration isolé, sans secrets personnels.

### 8.2 Console SQL

- Requête partagée avec Yjs ; curseurs, sélections et Ctrl+Z personnel.
- Chaque exécution utilise une version précise du texte et une sélection explicite.
- Afficher l'auteur, la base, l'heure, l'état et les erreurs ; conserver les résultats associés à la bonne exécution.
- Pagination et budgets de résultats ; pas de gros résultats dans le document CRDT.
- Préserver procédures, `DELIMITER`, résultats multiples, transactions et types exacts déjà pris en charge.
- Limiter ou refuser les nouvelles commandes lorsque l'hôte est indisponible.

### 8.3 Grille de données

- Bordure colorée sur la cellule sélectionnée, auteur au survol.
- Brouillons de cellules / lignes visibles, distincts des valeurs enregistrées et attribués à leur auteur.
- Préserver grands entiers, décimaux, binaires, chaîne vide, NULL, DEFAULT et champ omis.
- Contrôle optimiste des valeurs originales avant UPDATE / DELETE.
- Deux modifications concurrentes d'une même cellule produisent une proposition de résolution, pas un écrasement silencieux.
- Un verrou de confort éventuel doit expirer ; il ne remplace pas le contrôle SQL.
- Une validation réussie diffuse les nouvelles données ; un échec préserve la saisie.

### 8.4 Structure et schéma

- Conserver types, clés colorées, badges NULL/NOT NULL, icônes, petits boutons, relations et navigation.
- Pointer, sélectionner et déplacer les tables avec la couleur de chaque participant.
- Verrou temporaire d'interaction sur une table déplacée pour éviter les mouvements contradictoires.
- Pendant le drag : liaison provisoire colorée ; pendant la modal : liaison en pointillé et auteur indiqué.
- La liaison devient définitive seulement après réussite SQL et relecture des contraintes.
- Annulation, expiration ou départ retirent les éléments provisoires.
- Sérialiser les changements de structure ; préserver attributs, valeurs par défaut, commentaires, index et contraintes composées.

## 9. Aperçus intégrés

Prévoir deux modes explicitement nommés :

1. Aperçu personnel : navigation et session PHP personnelles sur le projet commun.
2. Aperçu suivi : une personne pilote ; les autres suivent une navigation et les interactions autorisées.

Instrumenter seulement les aperçus intégrés contrôlés par ALWIS. La page reçoit un canal authentifié et limité ; vérifier origine, source et identifiant de session des messages. Respecter la sandbox, les politiques CSP et les contraintes d'isolation WASM.

Partager pointeur, clics, défilement et sélections avec des positions relatives au document / aux éléments. Pour les zones éditables, utiliser une représentation adaptée au DOM ; une superposition seule ne garantit pas la correspondance des caractères.

Ne jamais diffuser automatiquement mots de passe, fichiers locaux choisis, champs sensibles ni données privées d'une session PHP. Ne pas déclencher deux fois un formulaire ou un paiement en rejouant une interaction chez tous les participants.

Des pages exécutées séparément peuvent diverger selon cookies, requêtes, dimensions et temps. Ne pas promettre des écrans identiques avec un simple partage d'événements. Un partage vidéo est une option ultérieure distincte, plus coûteuse. Les fenêtres indépendantes restent personnelles par défaut.

## 10. SQLite et modèle de persistance

Pas de conteneur de base de données : SQLite est utilisé par Node.js dans un volume dédié. Prévoir migrations versionnées, mode WAL si approprié, transactions courtes, timeout de contention, intégrité et sauvegarde cohérente incluant le WAL ou l'API de sauvegarde.

Tables indicatives :

| Table | Contenu |
|---|---|
| rooms | partage, propriétaire, état, expiration, politique |
| invitations | empreinte, permissions, expiration, révocation |
| participants | identité, rôle, statut et bail |
| files | identifiants, chemins, versions, métadonnées partagées |
| document_snapshots | snapshots Yjs bornés et références |
| document_updates | journal borné pour reprise |
| transfer_reservations | taille réservée, état, expiration |
| temporary_files | chemin interne, taille réelle, version, propriétaire |
| usage_counters | périodes, trafic et réservations agrégés |
| commands | identifiants et résultats compacts des commandes dédupliquées |
| audit_events | opérations sensibles, sans secrets ni contenu intégral |

Proposition de budget distinct : 256 Mio pour base, WAL, journaux documentaires et fichiers auxiliaires de persistance, hors médias temporaires. Mesurer l'espace réel, pas seulement la taille du fichier principal. Interrompre les admissions ou compacter proprement avant saturation.

Les points de sauvegarde Yjs doivent éviter un historique croissant indéfiniment. La compaction doit être compatible avec les clients hors ligne et les garanties d'annulation annoncées.

## 11. Paramètres configurables

Exemple d'environnement ; les noms représentent un contrat à implémenter, pas des variables déjà reconnues par ALWIS :

```dotenv
# Identité et réseau
PUBLIC_BASE_URL=https://collab.example.org
ALLOWED_ORIGINS=https://alwis.example.org
PORT=3000
TRUST_PROXY=false

# Participants et présence
ROOM_MAX_PARTICIPANTS=6
GLOBAL_MAX_PARTICIPANTS=40
MAX_SOCKETS_PER_PARTICIPATION=2
RECONNECT_GRACE_SECONDS=30
HEARTBEAT_INTERVAL_SECONDS=15
PARTICIPANT_IDLE_SECONDS=120
PRESENCE_MAX_UPDATES_PER_SECOND=10

# Texte et protocole : budgets initiaux
MAX_TEXT_DOCUMENT_BYTES=1048576
MAX_ACTIVE_DOCUMENTS_PER_ROOM=8
GLOBAL_ACTIVE_DOCUMENT_BYTES=16777216
MAX_WS_MESSAGE_BYTES=262144
MAX_PENDING_COMMANDS_PER_ROOM=16
DOCUMENT_IDLE_EVICTION_SECONDS=300
SQL_RESULT_PAGE_ROWS=100
SQL_RESULT_MAX_BYTES=4194304

# Ces limites en octets ne bornent pas seules la mémoire CRDT réelle.
# Mesurer aussi heap, RSS, nombre de structures et files en attente.

# Stockage serveur
SQLITE_PATH=/data/collaboration.sqlite
METADATA_STORAGE_MAX_BYTES=268435456
TEMP_STORAGE_PATH=/transfers
TEMP_STORAGE_MAX_BYTES=4294967296
TEMP_STORAGE_ROOM_MAX_BYTES=1073741824
TEMP_FILE_TTL_SECONDS=3600
TEMP_FILE_MAX_BYTES=536870912
MIN_HOST_FREE_DISK_BYTES=5368709120

# Transferts
FILE_TRANSFER_CHUNK_BYTES=32768
FILE_TRANSFER_MAX_CONCURRENT_PER_PEER=2
FILE_TRANSFER_MAX_CONCURRENT_PER_ROOM=4
FILE_TRANSFER_MAX_CONCURRENT_GLOBAL=12
FILE_TRANSFER_BUFFER_HIGH_WATER_BYTES=1048576

# WebRTC / TURN
STUN_URLS=stun:turn.example.org:3478
TURN_URLS=turn:turn.example.org:3478?transport=udp,turns:turn.example.org:5349?transport=tcp
TURN_REALM=turn.example.org
TURN_CREDENTIAL_TTL_SECONDS=600
TURN_GLOBAL_MAX_BYTES_PER_SECOND=5242880
TURN_PARTICIPATION_MAX_BYTES_PER_SECOND=1048576
TURN_GLOBAL_DAILY_MAX_BYTES=10737418240
TURN_PARTICIPATION_DAILY_MAX_BYTES=1073741824
TURN_MAX_ALLOCATIONS_PER_PARTICIPATION=4
TURN_MAX_ALLOCATIONS_GLOBAL=160

# Retour visuel
REMOTE_INSERT_HIGHLIGHT_MS=2000

# Ressources conteneurs
COLLAB_MEMORY_LIMIT=640m
COLLAB_MEMORY_RESERVATION=256m
COLLAB_MEMORY_SWAP=640m
NODE_HEAP_MAX_MB=384
COLLAB_CPUS=0.75
TURN_MEMORY_LIMIT=256m
TURN_MEMORY_SWAP=256m
TURN_CPUS=0.25
```

Les plafonds de taille de fichier temporaire ne doivent pas devenir une limite arbitraire du P2P direct. Celui-ci doit appliquer ses propres contrôles d'espace invité, reprise et quotas de sécurité.

Valider toute configuration au démarrage : bornes, unités, cohérence, répertoires, URLs et secrets. Refuser une valeur invalide plutôt que démarrer avec une protection silencieusement désactivée. Ne pas modifier les plafonds Docker depuis une interface publique.

## 12. Conteneurs Docker

### 12.1 Répartition mémoire

| Service | Maximum |
|---|---:|
| Node.js + Yjs + SQLite | 640 Mio |
| coturn | 256 Mio |
| Marge dans le budget de 1 Gio | 128 Mio |

Les 896 Mio plafonnés couvrent les deux conteneurs, pas tout le serveur. Docker, le système, le reverse proxy existant, les caches et les autres applications consomment aussi de la mémoire. Si un proxy ou collecteur dédié est ajouté, lui affecter une part de la marge ou revoir la répartition. Vérifier le total ; ne pas attribuer 1 Gio à chaque conteneur.

`NODE_HEAP_MAX_MB` ne borne pas toute la mémoire du processus : Buffers, bibliothèques natives, SQLite et autres allocations sont en dehors du tas V8. Les limites applicatives doivent éviter l'OOM ; la limite Docker est un dernier garde-fou.

### 12.2 Image Node.js

- Utiliser une version LTS supportée, épinglée et testée ; verrouiller les dépendances.
- Préférer une image minimale compatible avec les dépendances SQLite choisies. Une image Alpine plus petite n'est pas automatiquement le meilleur choix si elle complique les modules natifs.
- Build multiétape, dépendances de production uniquement dans l'image finale.
- Utilisateur non root, filesystem racine en lecture seule, capacités supprimées, `no-new-privileges`.
- Secrets montés en fichiers hors Git ; ne pas les placer dans les arguments de build ou dans l'image.
- Arrêt gracieux : arrêter les admissions, notifier, vider les écritures bornées et fermer SQLite.

### 12.3 Exemple Compose de référence

Les images `ALWIS_COLLAB_IMAGE` et `COTURN_IMAGE` doivent être renseignées avec une version vérifiée, idéalement un digest. Le service Node.js, sa commande, son endpoint de santé et sa lecture des secrets restent à développer. Le fichier coturn doit être généré / préparé séparément ; Compose n'y injecte pas automatiquement les secrets.

```yaml
services:
  collaboration:
    image: ${ALWIS_COLLAB_IMAGE:?image ALWIS epinglee requise}
    init: true
    restart: unless-stopped
    user: "10001:10001"
    read_only: true
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    env_file:
      - ./collaboration.env
    environment:
      NODE_OPTIONS: --max-old-space-size=${NODE_HEAP_MAX_MB:-384}
      TURN_SHARED_SECRET_FILE: /run/secrets/turn_shared_secret
      SESSION_SECRET_FILE: /run/secrets/session_secret
    ports:
      - "127.0.0.1:3100:3000"
    volumes:
      - ./state:/data
      - ${TRANSFER_VOLUME_PATH:?volume temporaire avec quota requis}:/transfers
    tmpfs:
      - /tmp:size=16777216,uid=10001,gid=10001,mode=1770
    secrets:
      - turn_shared_secret
      - session_secret
    mem_limit: ${COLLAB_MEMORY_LIMIT:-640m}
    mem_reservation: ${COLLAB_MEMORY_RESERVATION:-256m}
    memswap_limit: ${COLLAB_MEMORY_SWAP:-640m}
    cpus: ${COLLAB_CPUS:-0.75}
    pids_limit: 128
    healthcheck:
      test: ["CMD", "node", "/app/healthcheck.mjs"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    stop_grace_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  turn:
    image: ${COTURN_IMAGE:?image coturn epinglee requise}
    restart: unless-stopped
    network_mode: host
    read_only: true
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    volumes:
      - ./coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro
      - ./coturn/tls:/etc/coturn/tls:ro
    tmpfs:
      - /tmp:size=8388608
    command: ["-c", "/etc/coturn/turnserver.conf"]
    mem_limit: ${TURN_MEMORY_LIMIT:-256m}
    memswap_limit: ${TURN_MEMORY_SWAP:-256m}
    cpus: ${TURN_CPUS:-0.25}
    pids_limit: 64
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

secrets:
  turn_shared_secret:
    file: ./secrets/turn_shared_secret
  session_secret:
    file: ./secrets/session_secret
```

Cet exemple suppose Docker Engine sur Linux. Le mode réseau hôte simplifie l'exposition des ports TURN, mais réduit l'isolation réseau : vérifier les listeners et le pare-feu. Il n'utilise pas `ports` pour coturn. Une alternative bridge avec ports publiés est possible, après validation du NAT et des performances. Vérifier le comportement du point d'entrée de l'image coturn choisie avant d'adopter la commande.

Le compte coturn non privilégié et les permissions des certificats doivent être configurés selon l'image retenue ; ne pas ajouter de privilèges généraux pour contourner un problème de permissions.

Les limites `mem_limit`, `memswap_limit`, `cpus` et `pids_limit` doivent être contrôlées avec `docker inspect` et les cgroups réellement appliqués. À valeur égale, `memswap_limit` et `mem_limit` visent l'absence de swap supplémentaire pour le conteneur, sous réserve du support de l'hôte. La réservation mémoire n'est pas une quantité préallouée ni une garantie de disponibilité.

### 12.4 Disque : plafond strict de 4 Gio

Un bind mount ou volume Docker ordinaire n'impose pas ce quota. Ne pas utiliser un `tmpfs` de 4 Gio : il consommerait la mémoire / swap de l'hôte.

Options :

1. Quota de projet de système de fichiers, si le système et le montage le permettent.
2. Volume / partition dédiée de taille bornée.
3. Image disque de taille fixe montée en loop pour une petite installation, avec procédures d'entretien et de récupération documentées.

La limite applicative porte sur les données réservées et écrites. Le quota système porte sur l'espace réellement consommé, métadonnées incluses : garder une marge si l'on veut pouvoir accepter exactement 4 Gio de contenu, ou annoncer un quota utile légèrement inférieur. Traiter `ENOSPC` sans perdre les autres fichiers ni corrompre les métadonnées.

Limiter séparément SQLite, WAL, logs et sauvegardes : ils ne sont pas automatiquement couverts par le volume temporaire. Préserver au moins 5 Gio libres sur l'hôte, seuil configurable, en arrêtant de nouveaux transferts avant saturation.

## 13. Réseau, HTTPS et déploiement

- Utiliser le reverse proxy HTTPS existant, certificat valide, support des upgrades WebSocket et timeouts compatibles.
- Vérifier les origines WSS, cookies, CSRF et politique de proxy ; ne faire confiance aux en-têtes proxy qu'en provenance du proxy déclaré.
- Pour coturn : ouvrir les ports choisis, typiquement 3478 UDP/TCP, 5349 TCP pour TURN TLS, et une plage UDP de relais explicite.
- Exemple de plage à tester : 49160–49359. Dimensionner selon les allocations effectives, pas seulement le nombre de personnes.
- Adapter le pare-feu du serveur et celui du fournisseur, ainsi que la configuration d'adresse publique / NAT.
- Ne pas supposer que le reverse proxy HTTP relaie TURN UDP ; ce sont des chemins réseau différents.
- TURN TLS sur 5349 peut rester bloqué sur certains réseaux ; un secours sur 443 demande une adresse / un routage adapté et ne se superpose pas librement au HTTPS existant.
- Vérifier IPv4 / IPv6, réseaux mobiles, CGNAT et réseaux d'entreprise.
- Préserver COOP/COEP, CSP et fonctionnement du Service Worker d'ALWIS ; ne pas corriger une intégration en supprimant l'isolation requise par le WASM multithread.

Le serveur observé est déjà chargé : environ 19,6 / 23,4 Gio de RAM utilisée, swap de 2 Gio pleine et disque à 80 %. Ces valeurs sont un instantané, pas une mesure de capacité. Contrôler mémoire disponible, activité swap, nombre de cœurs, charge et débit avant déploiement. Commencer avec une salle puis augmenter.

Ne pas exécuter dans cette étape des opérations de partitionnement, formatage, pare-feu ou suppression sur un serveur réel sans connaître sa configuration et sans autorisation explicite.

## 14. Vercel : variante et limites

L'interface peut être hébergée sur Vercel tandis que Node.js, SQLite et coturn tournent sur le serveur personnel. Configurer les origines, HTTPS et les politiques d'isolation en conséquence.

Le P2P se déroule dans les navigateurs et ne dépend pas de l'hébergement de l'interface. La signalisation peut être hébergée ailleurs que TURN.

Une Function ne fournit pas un fichier SQLite local durable partagé. Elle ne remplace pas non plus un service coturn avec son réseau UDP et ses ports de relais. Une variante administrée via Vercel nécessite des services partenaires pour ces fonctions. Vérifier les capacités et tarifs Vercel à la date d'implémentation : ne pas figer leur offre dans le code.

La cible principale de ce document reste le serveur personnel, sans dépendance obligatoire à Vercel, Redis, Liveblocks ou un service TURN payant.

## 15. Observabilité et erreurs

Écran d'administration protégé :

- Salles, participants actifs / réservés, connexions et refus d'admission.
- RSS, heap, mémoire des conteneurs, CPU et redémarrages OOM.
- Documents actifs, tailles, files d'attente, temps de synchronisation.
- Connexions directes / relayées, allocations TURN, débits et volumes.
- Stockage temporaire réservé / réel, espace restant, âge des fichiers.
- Taille SQLite + WAL, opérations de nettoyage et erreurs disque.

Un endpoint de santé vérifie le processus ; un endpoint de disponibilité distinct vérifie la capacité d'admission et les dépendances nécessaires. Un healthcheck Docker défaillant ne redémarre pas automatiquement le conteneur à lui seul : définir la supervision souhaitée.

Codes d'erreur stables, messages français compréhensibles et détails techniques accessibles sans secrets : salle complète, serveur complet, permission refusée, hôte absent, fichier modifié, quota temporaire atteint, relais indisponible, budget TURN épuisé, reprise nécessaire, disque insuffisant.

Conserver saisies et brouillons après échec. Ne jamais remplacer une erreur utile par un succès d'arrière-plan sans rapport.

## 16. Critères de validation

### Fonctionnels

- Deux puis six personnes modifient le même fichier ; aucune frappe perdue ou dupliquée.
- Insertions concurrentes, suppressions, Unicode, collages, snippets, Emmet et formatage.
- Ctrl+Z personnel, sans annuler globalement le travail distant.
- Reconnexion pendant frappe, téléchargement et commande SQL ; états cohérents.
- Fichiers renommés, supprimés, remplacés et ouverts simultanément.
- Homonymes, contraste, clavier, réduction des animations, petit écran.
- Requête SQL partagée, résultats paginés, conflits de cellules, clés composées et modal de relation en pointillé.
- Aperçu personnel / suivi sans double soumission ni diffusion de champs sensibles.

### Réseau et fichiers

- WebRTC direct et TURN forcé ; vérifier le chemin par statistiques et compteurs serveur.
- Deux navigateurs sur réseaux différents : deux onglets du même appareil ne suffisent pas.
- STUN / TURN indisponible, UDP bloqué, réseau mobile, changement de réseau.
- Gros fichiers et vidéos par plages sans croissance mémoire proportionnelle à leur taille.
- Annulation et reprise avec vérification d'empreinte ; version changée pendant transfert.
- Quatre Gio réservés atteints, disque plein, cleanup interrompu, redémarrage.
- Tentatives d'accès hors partage, chemins dangereux, jetons expirés et destinations TURN interdites.

### Ressources et charge

- Septième participant et quarante-et-unième participation refusés proprement, y compris sous concurrence.
- Reconnexions simultanées sans double place ni contournement.
- Six personnes par salle puis quarante réparties, avec frappe, présence et transferts réels.
- Mémoire Node.js et coturn sous les limites, sans OOM ; vérifier buffers et historiques CRDT.
- Débit et allocations TURN plafonnés ; compteur quotidien et blocage effectif des sessions existantes validés.
- Endurance, nettoyage et retour des ressources après fermeture des salles.
- Mesures avant / pendant / après : RSS, heap, swap active, CPU, réseau et disque.

Exécuter les parcours dans Chromium et Firefox sur le paquet réellement construit. Tester Safari si annoncé comme supporté. Les tests ne doivent pas seulement vérifier la présence de boutons ou des événements simulés.

## 17. Plan d'implémentation et livraison

1. Auditer les services et stockages actuels ; établir les points d'intégration sans perdre les modifications existantes.
2. Construire Node.js, SQLite, invitations, rôles, quotas de places et Docker minimal.
3. Brancher Yjs à CodeMirror, présence et annulation personnelle ; valider les scénarios concurrents.
4. Ajouter catalogue, OPFS invité, transferts WebRTC directs, puis coturn et quotas de relais.
5. Ajouter le cache disque facultatif et sa limite système de 4 Gio.
6. Brancher les commandes du runtime hôte, SQL partagé, grille et schéma.
7. Ajouter l'aperçu suivi avec ses restrictions explicites.
8. Valider charge, sécurité, quotas, déconnexions et paquet statique ; documenter les résultats mesurés.

Livrables attendus : code client / serveur, image Docker, Compose, exemple d'environnement sans secrets, configuration coturn commentée, migrations SQLite, procédures d'installation et de mise à jour / retour arrière, sauvegarde / restauration, tests et rapport de consommation.

Ne pas annoncer « quarante utilisateurs supportés avec 1 Gio » avant un test représentatif. Si le budget est trop serré, réduire les admissions ou les fonctions actives de manière explicite plutôt qu'augmenter silencieusement les plafonds.

## 18. Références techniques

- Yjs : https://docs.yjs.dev/
- Intégration CodeMirror 6 : https://github.com/yjs/y-codemirror.next
- Annulation Yjs : https://docs.yjs.dev/api/undo-manager
- WebRTC DataChannel : https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel
- Stockage OPFS : https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- coturn : https://github.com/coturn/coturn
- Contraintes Docker : https://docs.docker.com/engine/containers/resource_constraints/
- SQLite WAL : https://sqlite.org/wal.html

Ces références servent à vérifier les API et options exactes lors de l'implémentation. Les exemples de configuration de ce document doivent être adaptés aux versions épinglées et validés avant exposition publique.
