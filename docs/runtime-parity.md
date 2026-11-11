# Preuves de validation du runtime publié

La bêta 2026.11 utilise le runtime PHP/MariaDB indépendant reconstruit depuis les sources. Cette page relie les affirmations fonctionnelles aux validations ; elle ne transforme pas un test réussi en garantie universelle ni en autorisation de licence.

## Identifier les bons octets

Le [build natif 42924952591](https://github.com/Bastian-Noel/ALWIS/actions/runs/42924952591) a réussi sur la révision `1d86dcdafcff5c61bfe5a31707fcb8f80f3ccd92`. Le SHA-256 du WASM CI est :

```text
2fbe7970fd67139a27cf05983e1a1bfe372fe8556231abdbe394c764cbb0df62
```

La [release v2026.11.0-beta.1](https://github.com/Bastian-Noel/ALWIS/releases/tag/v2026.11.0-beta.1) contient le paquet applicatif, les reçus de validation, les sources correspondantes du moteur, leur reçu et les sommes SHA-256. Le paquet applicatif publié correspond à `be76a72a2067a8ba792089a529d0e52e43cf9e78`. Les modifications documentaires ultérieures de `main` ne changent pas cette révision.

Une compilation WSL locale a aussi été vérifiée. Son empreinte peut différer de celle du runner CI ; n’interchangez pas ces deux identités. Les reçus doivent toujours être rapportés au binaire effectivement testé.

## Ce qui a été exercé

| Domaine | Vérification dans Chromium et Firefox | Ce que cela démontre |
|---|---|---|
| PHP, HTTP, PDO, MySQLi | 17 scénarios de parité par navigateur | Résultats attendus des fixtures, sessions et compteurs SQL propres |
| HTTP sortant / cURL | 7 cas par navigateur | POST binaire, redirections, timeout, annulation et comportement du même site |
| Erreurs et reprise | 18 requêtes successives par navigateur | Erreur fatale, statuts, mémoire et requête suivante correctement isolés |
| Invités réels | Deux invités, sessions privées et base commune | Transport et exécution HTTP/PHP sur le nouveau moteur |
| Stabilité SQL | 12 requêtes mixtes répétées | Nettoyage des connexions et statements dans le parcours couvert |
| Charge courte | Deux clients, paliers de 5 et 10 requêtes/s | Fonctionnement dans cette charge bornée ; pas une capacité maximale certifiée |
| Reprise | Sauvegarde validée, redémarrage et interruption forcée | Restauration d’un point de reprise cohérent dans les scénarios testés |
| Studio complet | Parcours applicatifs des deux navigateurs | Intégration réelle de l’interface et du paquet construit |

Les tests sont dans [tests/browser](../tests/browser), notamment `native-parity.mjs`, `native-curl.mjs`, `native-error-recovery.mjs`, `collab-native-php-peers.mjs`, `database-stability.mjs`, `load-native.mjs` et `restart-native.mjs`.

## De la validation à la publication

Le [workflow FTP 42938200622](https://github.com/Bastian-Noel/ALWIS/actions/runs/42938200622) a publié le paquet validé. Le site HTTPS a été contrôlé avec sa version, sa révision, les en-têtes d’isolation et les empreintes de ressources critiques. Le [workflow conteneur 42940278432](https://github.com/Bastian-Noel/ALWIS/actions/runs/42940278432) a publié l’image AMD64/ARM64 du même paquet.

Publier une image ne redémarre pas automatiquement une instance Docker déjà en exploitation. De même, une validation invitée sur runner ne configure pas les domaines, certificats et droits d’un hébergement tiers.

## Périmètre et provenance

L’ancien WASM JoomEngine reste un témoin historique ; il ne doit pas être substitué au moteur indépendant publié. Les scripts de restauration vérifient les sources natives, le workflow d’origine, les empreintes WASM/JS et les reçus. Un simple contrôle des sources ne prouve pas qu’une compilation ou une exécution a eu lieu.

Le problème de compatibilité GPL des deux fichiers historiques de formatage PHP reste documenté dans [l’état de licence](../provenance/release-licensing-status.json). L’autorisation interne de publication de cette bêta ne modifie pas les droits des tiers.

[Architecture](architecture.md) · [Compiler le moteur](native-qa-build.md) · [Compatibilité](compatibility.md) · [Publication](deployment.md)
