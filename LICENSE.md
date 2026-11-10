# Licences d'ALWIS

**Copyright © 2026 Bastian Noël — [Bastian-Noel/ALWIS](https://github.com/Bastian-Noel/ALWIS).**

ALWIS réunit plusieurs composants. **Le dépôt et les fichiers WASM livrés ne sont pas sous une licence unique.** Les conditions d'un composant tiers restent inchangées et peuvent autoriser l'usage commercial.

## 1. Code logiciel original ALWIS — GPLv2

À compter du 10 novembre 2026, les contributions logicielles originales dont Bastian Noël détient les droits sont proposées sous **GNU General Public License version 2 uniquement (GPL-2.0-only)**. Ce choix couvre notamment les sources originales de `apps/`, `packages/`, `engine/`, `server/`, `scripts/`, les tests et les recettes de compilation. Il inclut l'interface, les services web, l'orchestration et les adaptateurs natifs.

Le titulaire a expressément autorisé ce choix pour privilégier la publication conforme sous GPLv2, y compris l'utilisation commerciale. Aucune restriction non commerciale supplémentaire ne s'applique à ces contributions sous GPLv2. Le texte intégral figure dans [LICENSES/GPL-2.0-only.txt](LICENSES/GPL-2.0-only.txt). Le logiciel est fourni sans garantie, selon ce texte.

Les composants tiers, copies et adaptations conservent leurs droits, licences et notices propres ; cette autorisation ne prétend pas concéder des droits détenus par des tiers. La documentation et les visuels restent traités séparément ci-dessous. Les permissions accordées aux anciennes copies sous PolyForm ne sont pas révoquées ; son texte est conservé pour l'historique.

Attribution conservée (le préfixe historique ci-dessous ne crée aucune condition supplémentaire à la GPL) :

Required Notice: ALWIS — Copyright © 2026 Bastian Noël — https://github.com/Bastian-Noel/ALWIS

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
