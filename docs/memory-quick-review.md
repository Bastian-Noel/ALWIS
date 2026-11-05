# Résumé des mesures mémoire

Un relevé antérieur utilisait la PSS. Le rapport Windows du 5 novembre 2026 utilise la mémoire résidente privée, exclut les pages partagées et détaille séparément le moteur, les services de langage et les vues. Ces métriques ne sont pas directement comparables.

Dans ce nouveau rapport, PHP seul mesure 236,2 Mio sous Chromium et 430,2 Mio sous Firefox ; PHP avec SQL initialisé mesure 354,0 et 571,5 Mio. Le protocole n’a que deux ou trois répétitions par scénario : ce sont des observations, pas des budgets garantis.

La [vue simplifiée avec graphiques](performance-summary.md) présente les principaux résultats. Le [rapport détaillé](performance.md) conserve toutes les configurations et le protocole.
