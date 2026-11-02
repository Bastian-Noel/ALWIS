# Recettes historiques, non actives

Ces trois workflows appartenaient à la préparation des sources et aux témoins amont : compilation PHP/MariaDB séparés, mesure du témoin et archivage des sources. Ils sont conservés hors de `workflows/` pour leur reproductibilité et ne se déclenchent plus.

Pour une nouvelle expérience amont, copier explicitement la recette nécessaire dans `.github/workflows/`, vérifier ses versions et la lancer manuellement. Le produit courant utilise les deux workflows actifs : validation du studio et publication FTP manuelle. Les binaires natifs validés sont publiés dans une release technique épinglée et vérifiés contre leurs sources.
