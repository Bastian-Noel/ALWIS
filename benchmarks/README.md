# Mesures reproductibles

Pour chaque essai conserver commit, SHA-256 des assets, options de compilation, navigateur/version, OS, CPU, mémoire disponible, profil et commandes. Les runners CI servent à vérifier la reproduction ; leurs chiffres ne remplacent pas une mesure interactive sur le matériel cible.

Mesurer séparément démarrage froid/chaud, PHP seul, SQL seul, PHP avec 1/10/100 appels SQL, persistance et restauration. Conserver les échantillons bruts et calculer p50/p95 plutôt que seulement une moyenne. Distinguer durée moteur et durée HTTP complète.

Mémoire : taille initiale/maximum/atteinte de la mémoire WASM, allocations vivantes si instrumentables, mémoire JS et mesure globale du navigateur si disponible. Une mesure indisponible reste explicitement indisponible ; `memory.buffer.byteLength` n'est pas la RAM physique.

Fenêtres : 1, 2, 4 puis 8 fenêtres comme points de mesure, sans limite structurelle à 8 ; sessions toutes distinctes puis partagées. Mesurer la surcharge marginale et l'admission sous saturation.

Expériences SQL : jamais démarré, actif, arrêté, redémarré, puis cycles répétés. Vérifier données et transactions après chaque transition. Conserver l'arrêt à chaud seulement si gain mesuré et stabilité justifient sa complexité.

Outils : actif, en veille, déchargé puis restauré. Mesurer mémoire récupérée, temps de reprise, intégrité des modifications et historique borné.

## Déclenchement et preuve

Le [workflow de mesures](../.github/workflows/baseline-measurements.yml) est lancé après chaque exécution native terminée avec statut `success` **ou `failure`** ; l'échec d'un job MariaDB original ne masque donc plus un artifact PHP réussi. Un lancement manuel peut fournir un `run_id` natif. Le workflow exige explicitement l'artifact `baseline-php-8.4` : absent, il échoue (il ne déclare pas de mesures imaginaires).

Le harness `baseline-browser.mjs` s'exécute contre la compilation JoomEngine et son **bridge épinglé 0.1.1**, pas contre la variante bridge 0.1.8. Chaque fichier `chromium.json` / `firefox.json` contient versions, empreintes, mesures individuelles, validation des réponses et persistance ou erreur explicite. Les artefacts CI ont une rétention de 90 jours : un résultat durable doit ensuite être intégré au dépôt avec son contexte, sans modifier les données brutes.

La mémoire d'agent navigateur est mesurée seulement si l'API `measureUserAgentSpecificMemory` est disponible ; le résultat est autrement marqué non disponible. Ce chiffre n'est ni la taille des pages linéaires WASM, ni la mémoire physique du navigateur. Sans mesure fiable et comparable, le jalon 3 demeure **ouvert**.
