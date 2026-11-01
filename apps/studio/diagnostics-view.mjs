/** Shared real component, also imported by the isolated stress page. */
export function diagnosticCard(entry) {
  const card=document.createElement('details');card.className='diagnostic-entry';card.dataset.level=entry.level;
  const summary=document.createElement('summary');
  const level=document.createElement('span');level.className='log-level';level.textContent={error:'Erreur',warning:'Attention',info:'Info'}[entry.level]??'Info';
  const time=document.createElement('time');time.dateTime=entry.time;time.textContent=new Intl.DateTimeFormat('fr',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(entry.time));
  const text=document.createElement('span');text.className='log-message';text.dir='auto';text.textContent=entry.message||'Événement sans message';
  summary.append(level,time,text);card.append(summary);
  const context=document.createElement('p');context.className='hint';context.textContent=`${entry.id} · ${entry.context}`;card.append(context);
  if(entry.recovery){const recovery=document.createElement('p');recovery.textContent=entry.recovery;card.append(recovery);}
  if(entry.details){const pre=document.createElement('pre');pre.textContent=entry.details;pre.tabIndex=0;pre.setAttribute('aria-label','Détails du diagnostic');card.append(pre);}
  return card;
}
