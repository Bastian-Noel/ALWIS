# Édition serveur ALWIS

[Voir le paquet sur GitHub](https://github.com/Bastian-Noel/ALWIS/pkgs/container/alwis-server) · [Configurer et lancer avec Docker Compose](deployment.md)

L’édition serveur distribue la même interface ALWIS derrière un conteneur Node.js et ajoute `/admin/server` pour configurer l’instance. Le tag `latest` suit la dernière publication du conteneur ; les tags numérotés permettent de rester sur une version précise.

Le conteneur ne lance pas PHP ni MariaDB : ces moteurs, ainsi que les projets et leurs fichiers, restent dans le navigateur. SQLite conserve uniquement les réglages de l’instance. Le serveur inclut des fonctions de collaboration WebSocket, activables dans sa configuration. Le navigateur hôte conserve le moteur PHP/MariaDB. Voir [collaboration](collaboration.md) pour les possibilités et limites.

Les paramètres Compose, variables d’environnement, secret administrateur, reverse proxy, mises à jour et sauvegarde sont regroupés dans le [guide Hébergement et publication](deployment.md).


## Aperçu HTTP invité sur une origine isolée (expérimental)

L'aperçu PHP interactif partagé **ne doit pas tourner sur la même origine que le studio**. Le code PHP peut générer du JavaScript arbitraire : une iframe même origine avec `allow-scripts` et `allow-same-origin` peut accéder au DOM du studio.

Configurez une origine HTTPS sur un domaine dédié indépendant du studio :

```dotenv
PUBLIC_BASE_URL=https://studio.exemple.fr
ALWIS_PREVIEW_ORIGIN=https://alwis-preview-dedie.exemple.net
```

**Sécurité des cookies : choisissez un domaine enregistrable distinct, pas simplement un autre sous-domaine.** `studio.exemple.fr` et `preview.exemple.fr` partageraient les éventuels cookies `Domain=.exemple.fr`, lisibles ou modifiables par le JavaScript du projet. Le serveur refuse désormais ce montage : utilisez un domaine réservé exclusivement aux aperçus non fiables, qui ne partage aucune authentification avec d'autres services. En environnement local, deux origines `localhost` différentes restent autorisées pour les tests.

Les deux noms doivent joindre le **même conteneur ALWIS** via deux hôtes virtuels du reverse proxy. Conservez le **Host** et le protocole d'origine dans le proxy et activez TLS pour les deux. Le serveur n'expose que `guest-broker.html`, `guest-broker.mjs`, `guest-sw.js` et `_pbl/client.js` sur l'hôte d'aperçu ; le studio, l'administration et le signaling ne s'y affichent pas. Les scripts PHP et les fichiers du projet sont exécutés uniquement par le navigateur hôte.

Sans `ALWIS_PREVIEW_ORIGIN`, l'aperçu HTTP des invités est **désactivé** ; le miroir DOM historique reste utilisé. Le bouton de permission PHP ne peut pas activer un aperçu non isolé. Le studio n'installe jamais le Service Worker invité sur son propre nom de domaine.

## État de validation et version disponible

Le parcours de deux vrais invités, les sessions privées et la base partagée ont été validés dans Chromium et Firefox sur le runtime indépendant. Cette preuve sur runner ne remplace pas la vérification DNS/TLS de votre propre instance. [Preuves et limites](runtime-parity.md).

L’image publique `ghcr.io/bastian-noel/alwis-server:2026.11.0-beta.1` est disponible pour **linux/amd64 et linux/arm64**. `latest` suit la publication courante ; figez un tag numéroté si vous voulez maîtriser vos mises à jour. Publier cette image ne met pas à jour automatiquement un conteneur déjà lancé.

![Du paquet vérifié au site statique et à l’image conteneur.](images/figures/publication.png)

[Schéma SVG](figures/publication.svg) · [Installation Compose](deployment.md) · [Dépannage](troubleshooting.md).
