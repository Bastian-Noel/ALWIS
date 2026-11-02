# Tests

`npm test` exécute les tests unitaires `*.test.mjs`. Les garder à ce niveau évite une migration sans bénéfice des commandes existantes. `browser/` contient les parcours Chromium et Firefox et son propre guide. Les jeux de données communs restent dans `../fixtures/`. La validation du paquet livré est `node tests/browser/site-package.mjs`. Les reçus sont des preuves datées liées à une révision, pas des garanties sur main.
