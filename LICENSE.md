# Licences d'ALWIS

**Copyright © 2026 Bastian Noël — [Bastian-Noel/ALWIS](https://github.com/Bastian-Noel/ALWIS).**

ALWIS réunit plusieurs composants. **Le dépôt et les fichiers WASM livrés ne sont pas sous une licence unique.** Les conditions d'un composant tiers restent inchangées et peuvent autoriser l'usage commercial.

## 1. Code original ALWIS — indépendant du runtime natif

Sauf mention contraire dans un fichier, et **uniquement pour les contributions originales dont Bastian Noël détient les droits**, les sources autonomes suivantes sont mises à disposition sous **PolyForm Noncommercial 1.0.0** :

- `apps/studio/workbench/`, `apps/studio/collab/` et `apps/studio/database/` : interface et services Javascript originaux.
- `apps/studio/project-hub.mjs`, `apps/studio/service-worker.mjs`, `apps/studio/client-bootstrap.js` : orchestration web originale, **dans la mesure où leur utilisation ou distribution est juridiquement indépendante d'une œuvre couverte par la GPL**.
- `server/` : code original du serveur HTTP et de l'administration, lorsqu'il est distribué en tant que composant distinct.

Texte intégral : [LICENSES/PolyForm-Noncommercial-1.0.0.txt](LICENSES/PolyForm-Noncommercial-1.0.0.txt) · [site officiel](https://polyformproject.org/licenses/noncommercial/1.0.0).

PolyForm autorise la modification et le partage **à des fins non commerciales** selon ses termes. Les utilisations commerciales du seul code ALWIS concerné nécessitent une autorisation distincte du titulaire des droits.

La distribution d'un composant séparé sous PolyForm ne permet **pas** d'ajouter une restriction non commerciale aux droits déjà accordés par une licence tierce. Les frontières entre l'application web et le runtime GPLv2 n'ont pas encore reçu de validation juridique ; **ne pas en déduire que le paquet ALWIS complet est juridiquement redistribuable sous PolyForm**. Les éventuelles portions de code tierces présentes dans ces chemins conservent leurs licences.

**Mention obligatoire à transmettre avec chaque copie du code ALWIS sous PolyForm :**

Required Notice: ALWIS — Copyright © 2026 Bastian Noël — https://github.com/Bastian-Noel/ALWIS

Transmettre aussi le texte ou l'URL de la licence PolyForm. Une copie modifiée devrait préciser les différences ; cette recommandation n'ajoute pas de condition non prévue par la licence officielle.

## 2. Runtime natif PHP/MariaDB

MariaDB Server est sous **GPL-2.0-only**. Le WASM compilé avec MariaDB, les adaptateurs natifs faisant partie de l'œuvre combinée et les autres composants intégrés doivent respecter **leurs licences et exceptions exactes**, notamment PHP License, wolfSSL et éventuelles licences LGPL.

Le code original ALWIS effectivement incorporé à l'œuvre native dérivée de MariaDB ne revendique **aucune restriction non commerciale supplémentaire** sur les droits GPLv2. Les auteurs et modifications doivent rester attribués dans les sources, notices et historiques pertinents.

L'ancien binaire épinglé contient potentiellement le patch JoomEngine Apache-2.0 incorporé à MariaDB GPLv2. Un candidat de remplacement a **été recompilé et validé techniquement** dans Chromium et Firefox (CI 42851425186), mais sa redistribution n'est pas encore approuvée. Cela empêche de déclarer le runtime actuel conforme.

Voir [le statut de publication](provenance/release-licensing-status.json) et [l'audit des composants](provenance/component-license-map.md).

## 3. Documentation et visuels originaux

Les **textes et illustrations originaux** de `docs/` et les textes originaux du README, à l'exclusion des extraits tiers, notices et captures de contenus non détenus, sont proposés sous [**CC BY-NC-SA 4.0**](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode).

Cette licence impose l'attribution de l'auteur, le lien à la licence et l'indication des changements, avec partage à l'identique des adaptations couvertes. Elle **ne s'applique pas aux fichiers de code**.

## 4. Tiers, marques, provenance et publication

- Voir [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) et [LICENSES/README.md](LICENSES/README.md) pour les composants reconnus ; toute licence tierce garde sa portée.
- Les marques, logos de tiers et noms des projets ne sont pas licenciés par ce document.
- Un fichier non identifié ne reçoit **pas** automatiquement PolyForm : en l'absence de permission explicite, les droits de ses auteurs restent réservés.
- Les anciennes releases et images déjà diffusées conservent leurs propres obligations ; un changement de licence ultérieur ne les efface pas.
- La publication FTP, Docker ou native reste bloquée jusqu'à vérification de tous les points de l'audit.

Cette attribution et cette délimitation constituent la politique choisie par le projet, **pas une validation juridique du lien entre tous les composants**. Une revue juridique des contributions et combinaisons reste requise avant la diffusion d'une nouvelle version.
