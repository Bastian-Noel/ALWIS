# Audit de réorganisation

État de départ : main 2dcb937, propre localement. Releases applicatives : v0.1.0 et v0.2.0-preview.2 ; main comporte des améliorations postérieures. L’archive sources-2026-10-31 reste nécessaire. Branche technique initiale : 3272ee55196d5db449fa2308d5eec80fbba7c2a5.

Constats : README moteur décrivant encore la cible future ; build de production sous spike ; guides et bilans dupliqués ; README exigeant un build avant même d’expliquer le ZIP ; packaging limité au premier niveau des modules SQL ; restauration dépendant d’une branche.

Choix : ne pas découper artificiellement le contrôleur studio ni déplacer les points d’entrée web ; regrouper les modules SQL avec leurs dépendances ; conserver la profondeur de la recette native pour préserver ses chemins relatifs et son empreinte ; cinq guides de référence et CONTRIBUTING. Tests unitaires conservés au premier niveau, fixtures communes conservées. Aucun dossier vide.

Les bilans chronologiques et procédures initiales obsolètes supprimés de docs restent dans Git ; les décisions, mesures, commandes et limites utiles sont reprises dans les guides. Les sources, notices et preuves natives restent conservées. La conversation de provenance est historique, pas une instruction active. Aucun tag applicatif existant déplacé ; aucune release utile supprimée. Pas de choix arbitraire d’une licence globale.

Validation de migration : release technique publiée par le workflow 41548489229 ; manifeste et deux fichiers téléchargés indépendamment, SHA256SUMS vérifié. La CI 41548487642 a restauré cette release et validé le paquet sur les deux navigateurs ; un contrôle de suppression de fichier lisait la liste avant sa mise à jour asynchrone. Le test attend désormais le retrait réel de l’option. Les parcours locaux code/SQL et IDE passent sur Chromium et Firefox.

État final : CI complète réussie sur f98b754 (les commits suivants ne changent que la documentation), https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41548694782 . Publication native réussie : https://github.com/Bastian-Noel/WASMWebServer/actions/runs/41548489229 . Release technique : https://github.com/Bastian-Noel/WASMWebServer/releases/tag/native-runtime-2026-11-01 . Branche studio-native-runtime supprimée après ces validations ; main reste la seule branche distante. Les trois releases préexistantes et leurs pièces jointes sont conservées. Le contrôle de source modifiée a été testé dans une copie temporaire et refuse bien le moteur périmé.
