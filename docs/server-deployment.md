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

> [!WARNING]
> La connexion WebRTC/relai, les cookies et la persistance doivent encore être validés de bout en bout avec deux vrais navigateurs invités sur un vrai site PHP, avant déploiement public. La disponibilité de ce code en branche de développement ne constitue pas une autorisation de publier un WASM ancien non conforme.
