/** Bounded, local diagnostics. Never forwards project contents to a service. */
export function createDiagnosticLog({maxEntries=200,maxMessage=4096,maxDetails=8192}={}) {
  const entries=[];let sequence=0;
  const bounded=(value,limit)=>{const text=String(value??'');return text.length>limit?text.slice(0,limit)+'\n[Texte abrégé]':text;};
  return {
    add(level,message,{context='Studio',details='',recovery=''}={}) {
      const entry={id:'WWS-'+String(++sequence).padStart(4,'0'),time:new Date().toISOString(),level:['info','warning','error'].includes(level)?level:'info',context:bounded(context,160),message:bounded(message,maxMessage),details:bounded(details,maxDetails),recovery:bounded(recovery,1024)};
      entries.push(entry);if(entries.length>maxEntries)entries.splice(0,entries.length-maxEntries);return {...entry};
    },
    list(level){return entries.filter(entry=>!level||entry.level===level).map(entry=>({...entry}));},
    clear(){entries.length=0;},
    get capacity(){return maxEntries;}
  };
}
export function describeFailure(error) {
  const message=String(error?.message??error).slice(0,4096);
  let category='ACTION',recovery='Vérifiez les champs puis relancez cette action. Consultez les détails si le problème persiste.';
  if(error?.sqlstate){category='SQL';recovery='Vérifiez la base, les noms de colonnes et la requête. Corrigez le SQL avant de le réexécuter.';}
  if(/quota|ENOSPC|byte limit|exceeds.*limit|mémoire/i.test(message)){category='LIMITE';recovery='Réduisez le fichier, le résultat ou le nombre de données chargées, puis réessayez. Exportez les données utiles avant de fermer le projet.';}
  else if(/stopped|poisoned|initialization failed|Moteur perdu/i.test(message)){category='MOTEUR';recovery='Conservez les fichiers exportables. Rouvrez le projet depuis sa dernière sauvegarde ; les requêtes PHP ne seront pas rejouées automatiquement.';}
  else if(/sauvegarde|IndexedDB|ConstraintError/i.test(message)){category='SAUVEGARDE';recovery='Gardez cet onglet ouvert. Vérifiez le stockage disponible et réessayez « Sauvegarder le projet » avant de reprendre les clients.';}
  else if(/a changé|existe déjà|écraser/i.test(message)){category='CONFLIT';recovery='Relisez la version du projet avant de modifier la donnée. Copiez votre brouillon avant de recharger un fichier.';}
  return {category,message,recovery,details:[error?.sqlstate?`SQLSTATE ${error.sqlstate} · erreur ${error.errno??'non fournie'}`:'',String(error?.stack??'').slice(0,8192)].filter(Boolean).join('\n')};
}
