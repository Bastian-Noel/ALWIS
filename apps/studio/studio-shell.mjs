import {createDiagnosticLog,describeFailure} from './diagnostics.mjs';
import {diagnosticCard} from './diagnostics-view.mjs';
const $=selector=>document.querySelector(selector);
export function createStudioShell({project,isDirty,refresh}) {
  const log=createDiagnosticLog(),cards=new Map();let pending=0;
  const tabs=[...document.querySelectorAll('[role=tab][data-panel]')];
  function selectPanel(name,{focus=false}={}) {
    for(const tab of tabs){const selected=tab.dataset.panel===name;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$('#'+tab.getAttribute('aria-controls')).hidden=!selected;if(selected&&focus)tab.focus();}
    const tab=tabs.find(tab=>tab.dataset.panel===name);if(tab)document.title=`${tab.textContent.trim().replace(/^\d+\s*/, '')} · ${project()??'Studio'} · WASMWebServer`;
    if(name==='journal')renderLog();
  }
  for(const [index,tab]of tabs.entries()){
    tab.onclick=()=>selectPanel(tab.dataset.panel);
    tab.onkeydown=event=>{
      let target;
      if(['ArrowDown','ArrowRight'].includes(event.key))target=(index+1)%tabs.length;
      if(['ArrowUp','ArrowLeft'].includes(event.key))target=(index+tabs.length-1)%tabs.length;
      if(event.key==='Home')target=0;if(event.key==='End')target=tabs.length-1;
      if(target!==undefined){event.preventDefault();selectPanel(tabs[target].dataset.panel,{focus:true});}
    };
  }
  const compact=matchMedia('(max-width:850px)');
  const orientation=()=>$('.workspace-tabs').setAttribute('aria-orientation',compact.matches?'horizontal':'vertical');compact.addEventListener('change',orientation);orientation();
  function renderLog(){
    $('#log-count').textContent=`${log.list().length} / ${log.capacity} événements`;
    const errors=log.list('error').length;$('#error-count').textContent=String(errors);$('#error-count').hidden=errors===0;
    if($('#panel-journal').hidden)return;
    const entries=log.list($('#log-filter').value);const target=$('#journal-entries');
    const retained=new Set(log.list().map(entry=>entry.id)),visible=new Set(entries.map(entry=>entry.id));
    for(const [id]of cards)if(!retained.has(id))cards.delete(id);
    for(const child of [...target.children])if(!visible.has(child.dataset.entryId))child.remove();
    entries.toReversed().forEach((entry,index)=>{let card=cards.get(entry.id);if(!card){card=diagnosticCard(entry);card.dataset.entryId=entry.id;cards.set(entry.id,card);}if(target.children[index]!==card)target.insertBefore(card,target.children[index]??null);});
    if(!entries.length){const empty=document.createElement('p');empty.className='log-empty';empty.textContent=$('#log-filter').value?'Aucun événement pour ce filtre. Choisissez « Tous les événements » pour consulter le journal.':'Aucun événement. Les opérations et leurs erreurs apparaîtront ici.';target.append(empty);}
  }
  function record(level,message,details={}){const entry=log.add(level,message,details);renderLog();return entry;}
  function update(){
    const key=project();$('#project-name').textContent=key??'Aucun projet ouvert';$('#footer-project').textContent=key??'Aucun projet ouvert';
    $('#dirty-state').textContent=!key?'Choisissez un projet pour commencer':isDirty()?'Modifications à sauvegarder':'Projet ouvert';
    for(const control of document.querySelectorAll('[data-project-action]'))control.disabled=!key;
    for(const control of document.querySelectorAll('[data-tool]'))control.disabled=!key;
    if(!key){
      $('#engine-state').textContent='Aucun moteur actif.';$('#memory-capacity').textContent='—';$('#memory-used').textContent='—';$('#sql-phase').textContent='Aucun moteur';
      $('#vfs-readings').textContent='Ouvrez un projet puis actualisez les mesures.';$('#session-overview').textContent='Ouvrez un projet pour consulter ses sessions.';
    }
  }
  function status(message){$('#status').textContent=message;$('#status').removeAttribute('data-error');record('info',message,{context:project()??'Studio'});update();}
  function error(error,context='Studio'){
    const failure=describeFailure(error);const entry=record('error',failure.message,{context:project()?`${project()} · ${context}`:context,details:failure.details,recovery:failure.recovery});
    const firstLine=failure.message.split('\n',1)[0],headline=firstLine.length>360?firstLine.slice(0,360)+'… Consultez le diagnostic pour la suite.':firstLine;
    $('#status').textContent=(error?.sqlstate?`[${error.sqlstate}/${error.errno}] `:'')+headline;$('#status').setAttribute('data-error','');
    $('#error-title').textContent=`${failure.category} · ${context} · ${entry.id}`;
    $('#error-message').textContent=headline;$('#error-recovery').textContent=failure.recovery;$('#error-banner').hidden=false;update();
  }
  $('#log-filter').onchange=renderLog;
  $('#dismiss-error').onclick=()=>{$('#error-banner').hidden=true;};
  $('#show-error').onclick=()=>{selectPanel('journal',{focus:true});$('#log-filter').value='error';renderLog();};
  $('#clear-log').onclick=()=>{if(confirm('Effacer les événements de cet onglet ? Exportez le journal si vous souhaitez conserver les diagnostics.')){log.clear();renderLog();}};
  $('#export-log').onclick=()=>{
    const link=document.createElement('a'),data={format:1,project:project(),exportedAt:new Date().toISOString(),entries:log.list()};
    link.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.download='wasmwebserver-journal.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
  $('#refresh-resources').onclick=refresh;
  renderLog();update();
  return {record,error,status,update,selectPanel,
    busy(start){pending=Math.max(0,pending+(start?1:-1));$('#activity').textContent=pending?'Opération en cours…':'Disponible';$('#workspace').setAttribute('aria-busy',String(pending>0));},
    resources(state){
      const mib=value=>value===null||value===undefined?'Non mesuré':new Intl.NumberFormat('fr',{maximumFractionDigits:1}).format(value/1048576)+' Mio';
      $('#memory-capacity').textContent=mib(state.linearMemoryBytes);$('#memory-used').textContent=mib(state.allocatorUsedBytes);
      $('#sql-phase').textContent={dormant:'À la demande',running:'Active',stopped:'Arrêtée',failed:'En échec'}[state.sqlPhase]??'Non mesurée';
      const names={project:'Projet',sql:'MariaDB',temp:'Temporaire',system:'Système'};
      $('#vfs-readings').replaceChildren(...Object.entries(state.vfs?.groups??{}).map(([name,group])=>{const row=document.createElement('div');row.className='storage-row';const title=document.createElement('strong');title.textContent=names[name]??name;const value=document.createElement('span');value.textContent=`${mib(group.bytes)} / ${mib(group.maxBytes)} · ${group.nodes} éléments`;row.append(title,value);return row;}));
    }
  };
}
