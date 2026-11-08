# Provenance et composants tiers

Ce dossier sert à documenter les sources examinées et les composants incorporés. Il ne constitue pas, à lui seul, une preuve qu'un fichier du projet est original ou qu'une distribution respecte toutes les licences.

## Lire les registres

- `upstream-lock.json` épingle des dépôts et commits consultés ou utilisés comme sources de build. Un dépôt épinglé n'est pas nécessairement incorporé au produit.
- `submodules-lock.json` recense les gitlinks du moteur natif. Le champ `downloaded` décrit l'archive de préparation, pas nécessairement le contenu final du WASM.
- `source-map.csv` (et sa représentation JSON) localise des éléments amont qui ont été étudiés. `file_sha256` est l'empreinte du fichier amont référencé ; ce n'est pas une empreinte de comparaison avec le code ALWIS. `target` peut désigner une cible envisagée, pas un fichier livré.
- `import-manifest.json` conserve les empreintes de l'archive de préparation. Il ne remplace pas un inventaire de ce qui est réellement distribué.
- `apps/studio/editor/engines.lock.json`, les reçus de build et `package-lock.json` documentent des entrées de build différentes. Les reçus doivent toujours être associés à la release exacte.

## Catégories obligatoires pour toute nouvelle référence

Classer chaque référence comme l'une de ces catégories, sans les confondre :

1. **Inspiration** : idée ou comportement général ; aucun code, texte, image ou ressource protégé repris.
2. **Étude / comparaison** : source lue pour comprendre ou comparer ; pas d'incorporation revendiquée.
3. **Adaptation** : code tiers modifié et incorporé ; identifier le fichier ALWIS et le diff d'origine.
4. **Copie** : code tiers repris, même si les noms ou la mise en forme changent ; identifier exactement les deux fichiers et les lignes.
5. **Dépendance / binaire** : code ou binaire tiers utilisé à la compilation ou livré ; indiquer version, somme, licence et emplacement distribué.

Les champs actuels `action` de `source-map.csv` sont historiques et ne forment pas encore une taxonomie normalisée. Les nouvelles entrées doivent utiliser `provenance/reuse-ledger.csv` comme registre de livraison. Ne jamais convertir « inspiration » en preuve d'absence de copie sans comparaison de code.

## Procédure avant livraison

1. Inventorier le contenu réel du ZIP/site/Docker, y compris WASM, workers, fichiers générés, polices, icônes et sous-modules liés.
2. Relier chaque fichier tiers livré à son dépôt, version/commit, licence exacte et obligations (copyright, texte de licence, NOTICE, source correspondante, offre de source le cas échéant).
3. Ajouter chaque adaptation/copie au registre avec le fichier local, le fichier amont, les lignes ou le commit d'introduction, les auteurs, la licence et les obligations accomplies.
4. Pour chaque binaire, enregistrer les sources exactes, patchs, options de build, toolchain, sommes des sources et somme du binaire. Vérifier que la source correspond au binaire publié.
5. Générer et relire les notices de la release elle-même ; ne pas supposer qu'un fichier de notices de l'éditeur couvre le moteur natif ou les sous-modules.
6. Si une licence est absente, ambiguë, incompatible avec la distribution voulue ou si la provenance d'un extrait est inconnue, bloquer sa redistribution jusqu'à clarification ou remplacement.

## Portée

Un avis juridique dépend des fichiers effectivement distribués, de la façon dont ils sont combinés et des droits détenus sur les contributions. Les idées et interfaces ne donnent pas automatiquement le droit de reprendre l'expression concrète d'un projet. Conserver les commits et les empreintes améliore l'auditabilité, mais ne tranche pas ces questions.
