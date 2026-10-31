import { identifier, literal, editValue, sameValue } from './sql-values.mjs';
import { ProjectHub } from './project-hub.mjs';
import { readState, writeState } from './state.mjs';
const $ = selector => document.querySelector(selector), decoder = new TextDecoder();
let hub, dirty = false, operation = Promise.resolve();
const tools = new Map();
function status(text, error = false) { $('#status').textContent = text; $('#status').toggleAttribute('data-error', error); }
function action(task) {
  const expectedHub=hub;
  operation=operation.then(async()=>{
    if(task!==openProject&&hub!==expectedHub)throw Error('Le projet a changé. Relancez cette action dans le projet courant.');
    const recovering=$('#status').hasAttribute('data-error');if(recovering)status('Opération en cours…');
    const value=await task();if(recovering&&$('#status').textContent==='Opération en cours…')status('Opération terminée.');return value;
  }).catch(error=>status((error.sqlstate?'['+error.sqlstate+'/'+error.errno+'] ':'')+error.message,true));return operation;
}
const display = value => value === null ? 'NULL' : value instanceof Uint8Array ? literal(value) : String(value);
async function rows(sql, database) { return hub.runtime.sql(sql, database); }
async function files(path = '/workspace', depth = 0) {
  if (depth > 12) throw Error('Arborescence trop profonde');
  const output = [];
  for (const name of await hub.runtime.list(path)) {
    if (name==='.'||name==='..'||name==='.sessions'||name==='.git'||name.startsWith('.pbl-')) continue;
    const filename = path + '/' + name;
    const info = await hub.runtime.call('stat', { path: filename });
    if (info.directory) output.push(...await files(filename, depth + 1)); else output.push(filename.slice('/workspace'.length));
    if (output.length > 1024) throw Error('Affichage limité à 1 024 fichiers');
  }
  return output;
}
async function renderEditor(container, saved) {
  container.append($('#editor-template').content.cloneNode(true));
  const source = container.querySelector('.source'), filename = container.querySelector('.filename'), list = container.querySelector('.files'), message = container.querySelector('.message');
  let base = saved?.base;
  filename.value = saved?.path ?? '/index.php'; source.value = saved?.text ?? '';
  source.selectionStart = saved?.start ?? 0; source.selectionEnd = saved?.end ?? 0;
  const snapshot = () => ({ path: filename.value, text: source.value, base, dirty: base === undefined ? source.value !== '' : source.value !== base, start: source.selectionStart, end: source.selectionEnd });
  filename.oninput = () => { base = undefined; };
  const refresh = async () => { const names = await files(); list.replaceChildren(...names.map(name => Object.assign(document.createElement('option'), { value: name, textContent: name }))); };
  const load = async () => {
    source.value = decoder.decode(await hub.runtime.read('/workspace' + filename.value)); base = source.value; message.textContent = 'Fichier chargé.';
  };
  const write = async () => {
    if (!filename.value.startsWith('/')) filename.value = '/' + filename.value;
    if (base !== undefined) { const current = decoder.decode(await hub.runtime.read('/workspace' + filename.value)); if (current !== base && current !== source.value) throw Error('Le fichier a changé dans le projet. Rechargez-le avant de l’écraser.'); }
    await hub.runtime.write('/workspace' + filename.value, source.value); base = source.value; dirty = true; message.textContent = 'Fichier écrit ; sauvegardez le projet pour le conserver.'; await refresh();
  };
  container.querySelector('.load').onclick = () => action(load);
  container.querySelector('.write').onclick = () => action(write);
  container.querySelector('.refresh').onclick = () => action(refresh);
  list.onchange = () => action(async () => { await writeState('draft:' + hub.key + ':' + filename.value, snapshot()); filename.value = list.value; const draft = await readState('draft:' + hub.key + ':' + filename.value); if (draft) { source.value = draft.text; base = undefined; } else await load(); });
  source.oninput = () => { dirty = true; message.textContent = 'Brouillon modifié.'; };
  await refresh();
  if (!saved?.dirty) { try { await load(); } catch { message.textContent = 'Nouveau fichier : écrivez du code puis enregistrez.'; } }
  return { snapshot, write };
}
async function renderSQL(container, saved) {
  container.append($('#sql-template').content.cloneNode(true));
  const query = container.querySelector('.query'), database = container.querySelector('.database'), grid = container.querySelector('.grid'), tableSelect = container.querySelector('.table'), message = container.querySelector('.message');
  query.value = saved?.query ?? 'SHOW TABLES'; database.value = saved?.database ?? 'test';
  let result, page = saved?.page??0, editingTable, primaryKeys = [], totalRows = 0, viewDatabase;
  const rowCondition=(columns,row)=>columns.map((column,i)=>`${column.kind===1?'BINARY ':''}${identifier(column.name)} <=> ${literal(row[i],column)}`).join(' AND ');
  const draw = () => {
    grid.replaceChildren();
    if (!result) return;
    const targetTable=editingTable,targetDatabase=viewDatabase??database.value,columns=result.columns;
    const table = document.createElement('table');if(targetTable)table.createCaption().textContent='Données : '+targetDatabase+'.'+targetTable;const head = table.createTHead().insertRow();
    result.columns.forEach(column => { const cell = document.createElement('th'); cell.textContent = column.name; head.append(cell); });
    if(editingTable&&primaryKeys.length)head.append(Object.assign(document.createElement('th'),{textContent:'Actions'}));
    const body = table.createTBody();
    for (const row of editingTable ? result.rows : result.rows.slice(page * 100, page * 100 + 100)) {
      const tr = body.insertRow();
      row.forEach((value, index) => {
        const cell = tr.insertCell(); cell.textContent = display(value);
        if (editingTable && primaryKeys.length) {
          cell.dataset.editable = '';
          cell.ondblclick = () => {
            const mode=document.createElement('select'); mode.setAttribute('aria-label','Type de valeur');
            for(const [value,label] of [['text','Texte'],['hex','Binaire (hex)'],['null','NULL']]) mode.append(Object.assign(document.createElement('option'),{value,textContent:label}));
            mode.value=value===null?'null':value instanceof Uint8Array?'hex':'text';
            const input=document.createElement('input'); input.setAttribute('aria-label','Nouvelle valeur');
            input.value=value===null?'':value instanceof Uint8Array?[...value].map(b=>b.toString(16).padStart(2,'0')).join(''):String(value);
            const save=document.createElement('button');save.textContent='Valider';
            const cancel=document.createElement('button');cancel.textContent='Annuler';cancel.onclick=draw;
            cell.replaceChildren(mode,input,save,cancel);input.focus();
            const submit=()=>action(async()=>{
              const next=editValue(mode.value,input.value);if(sameValue(next,value)){draw();return;}
              const where=rowCondition(columns,row);
              const changed=await rows(`UPDATE ${identifier(targetTable)} SET ${identifier(columns[index].name)}=${literal(next,columns[index])} WHERE ${where} LIMIT 1`,targetDatabase);
              if(changed.affectedRows!=='1') throw Error('La ligne a changé depuis son affichage. Rechargez les données avant de modifier.');
              dirty=true;if(database.value===targetDatabase&&tableSelect.value===targetTable)await browse(false);
            });
            save.onclick=submit;
            input.onkeydown=event=>{if(event.key==='Escape')draw();if(event.key==='Enter')submit();};
          };
        }
      });
      if(editingTable&&primaryKeys.length){
        const cell=tr.insertCell(),button=document.createElement('button');button.textContent='Supprimer';cell.append(button);
        button.onclick=()=>{if(!confirm('Supprimer cette ligne de '+targetTable+' ?'))return;action(async()=>{
          const changed=await rows(`DELETE FROM ${identifier(targetTable)} WHERE ${rowCondition(columns,row)} LIMIT 1`,targetDatabase);
          if(changed.affectedRows!=='1')throw Error('La ligne a changé depuis son affichage. Rechargez les données.');dirty=true;if(database.value===targetDatabase&&tableSelect.value===targetTable)await browse(false);
        });};
      }
    }
    grid.append(table); container.querySelector('.page').textContent = `${page + 1} / ${Math.max(1, Math.ceil((editingTable ? totalRows : result.rows.length) / 100))}`;
    container.querySelector('.previous').disabled = page === 0; container.querySelector('.next').disabled = (page + 1) * 100 >= (editingTable ? totalRows : result.rows.length);
  };
  const execute = async () => { editingTable = undefined;viewDatabase=database.value; result = await rows(query.value, database.value); dirty = true; page = 0; message.textContent = `${result.rows.length} lignes · ${result.affectedRows} lignes affectées`; draw(); await updateEngine(); };
  const tables = async () => { const data = await rows('SHOW TABLES', database.value); tableSelect.replaceChildren(...data.rows.map(row => Object.assign(document.createElement('option'), { value: row[0], textContent: row[0] }))); };
  const browse = async (reset = true) => {
    const name = tableSelect.value; if (!name) return;
    const keys = await rows(`SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=${literal(database.value)} AND TABLE_NAME=${literal(name)} AND CONSTRAINT_NAME='PRIMARY' ORDER BY ORDINAL_POSITION`, database.value);
    primaryKeys = keys.rows.map(row => row[0]); editingTable = name;viewDatabase=database.value; if(reset)page=0;
    const count=await rows(`SELECT COUNT(*) FROM ${identifier(name)}`,database.value);
    if(BigInt(count.rows[0][0])>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Table trop grande pour cette pagination.');
    totalRows=Number(count.rows[0][0]);page=Math.min(page,Math.max(0,Math.ceil(totalRows/100)-1));
    const order=primaryKeys.length?' ORDER BY '+primaryKeys.map(identifier).join(','):'';
    result = await rows(`SELECT * FROM ${identifier(name)}${order} LIMIT 100 OFFSET ${page*100}`, database.value);
    message.textContent = primaryKeys.length ? `Double-cliquez pour modifier · ${totalRows} lignes · 100 lignes par page.` : `Lecture seule : aucune clé primaire · ${totalRows} lignes. L’ordre peut changer entre les pages.`; draw();
  };
  container.querySelector('.run').onclick = () => action(execute); container.querySelector('.tables').onclick = () => action(tables); container.querySelector('.browse').onclick = () => action(() => browse());
  container.querySelector('.previous').onclick = () => action(async()=>{page=Math.max(0,page-1);if(editingTable)await browse(false);else draw();}); container.querySelector('.next').onclick = () => action(async()=>{page++;if(editingTable)await browse(false);else draw();});
  const dialog=container.querySelector('.row-dialog'),fieldsBox=dialog.querySelector('.row-fields');let insertTarget,insertDatabase,inputs=[];
  container.querySelector('.insert').onclick=()=>action(async()=>{
    if(!tableSelect.value)throw Error('Choisissez une table.');insertTarget=tableSelect.value;insertDatabase=database.value;
    const columns=await rows(`SHOW FULL COLUMNS FROM ${identifier(insertTarget)}`,insertDatabase);
    fieldsBox.replaceChildren();inputs=[];
    for(const [name,type,collation,nullable,key,defaultValue,extra] of columns.rows){
      if(/(?:VIRTUAL|STORED|PERSISTENT) GENERATED/i.test(extra??''))continue;
      const row=document.createElement('label');row.className='row-field';
      row.append(document.createTextNode(name+' · '+type));const mode=document.createElement('select');mode.setAttribute('aria-label',name+' mode');
      for(const [value,text] of [['default','DEFAULT'],['text','Texte'],['hex','Binaire (hex)'],...(nullable==='YES'?[['null','NULL']]:[])])mode.append(Object.assign(document.createElement('option'),{value,textContent:text}));
      const input=document.createElement('input');input.setAttribute('aria-label',name+' valeur');input.placeholder=defaultValue===null?'':String(defaultValue);row.append(mode,input);fieldsBox.append(row);inputs.push({name,mode,input,nativeType:/^bit\b/i.test(type)?16:undefined});
    }
    dialog.querySelector('.message').textContent='';dialog.showModal();
  });
  dialog.querySelector('.insert-confirm').onclick=()=>{
    const submit=dialog.querySelector('.insert-confirm');if(submit.disabled)return;submit.disabled=true;
    action(async()=>{try{
      dialog.querySelector('.message').textContent='';
      const active=inputs.filter(field=>field.mode.value!=='default');
      await rows(`INSERT INTO ${identifier(insertTarget)} (${active.map(field=>identifier(field.name)).join(',')}) VALUES (${active.map(field=>literal(editValue(field.mode.value,field.input.value),field)).join(',')})`,insertDatabase);
      dirty=true;dialog.close();if(database.value===insertDatabase&&tableSelect.value===insertTarget)await browse(false);
    }catch(error){dialog.querySelector('.message').textContent=error.message;throw error;}finally{submit.disabled=false;}});
  };
  container.querySelector('.structure').onclick=()=>action(async()=>{
    if(!tableSelect.value)throw Error('Choisissez une table.');
    const ddl=await rows(`SHOW CREATE TABLE ${identifier(tableSelect.value)}`,database.value);
    const indexes=await rows(`SHOW INDEX FROM ${identifier(tableSelect.value)}`,database.value);
    const output=container.querySelector('.structure-output');output.hidden=false;
    output.textContent=ddl.rows[0][1]+';\n\nIndex :\n'+indexes.rows.map(row=>indexes.columns.map((col,i)=>col.name+': '+display(row[i])).join(' · ')).join('\n');
  });
  container.querySelector('.export-sql').onclick=()=>action(async()=>{
    const tool='/workspace/.pbl-export-'+crypto.randomUUID();
    const response=await fetch('/apps/studio/sql-export.php');if(!response.ok)throw Error('Outil d’export indisponible.');
    await hub.runtime.write(tool+'.php',await response.text());
    try{
      const result=await hub.runtime.request({script:tool+'.php',url:new URL('/export.php?database='+encodeURIComponent(database.value),location.href).href});
      if(result.exitCode!==0)throw Error(decoder.decode(result.stderr)||'Export SQL échoué.');
      const info=JSON.parse(decoder.decode(result.body));if(!info.ok)throw Error('Export SQL incomplet.');
      const bytes=await hub.runtime.read(tool+'.php.sql'),link=document.createElement('a');link.href=URL.createObjectURL(new Blob([bytes],{type:'application/sql'}));link.download=database.value+'.sql';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
      message.textContent=`Export : ${info.tables} tables, ${info.views} vues, ${info.routines} routines · ${info.bytes} octets. Événements non pris en charge. Restaurez dans un projet distinct.`;
    }finally{for(const suffix of ['.php','.php.sql'])try{await hub.runtime.remove(tool+suffix);}catch{/* Preserve the original export error. */}}
  });
  const input = container.querySelector('.sql-file'); container.querySelector('.import-sql').onclick = () => input.click();
  input.onchange = () => action(async () => {
    const file = input.files[0]; if (!file) return; message.textContent='Import SQL en cours…';
    if (file.size > 8 * 1024 * 1024) throw Error('Import SQL limité à 8 Mio.');
    const tool = '/workspace/.pbl-import-' + crypto.randomUUID();
    try {
      await hub.runtime.write(tool+'.php.sql',new Uint8Array(await file.arrayBuffer()));
      await hub.runtime.write(tool+'.php',`<?php $db=new PDO('mysql:charset=utf8mb4','root','');$name=$_GET['database']??'test';$db->exec('USE '.chr(96).str_replace(chr(96),chr(96).chr(96),$name).chr(96));$db->exec(file_get_contents(__FILE__.'.sql'));echo 'ok';`);
      const response=await hub.runtime.request({script:tool+'.php',url:new URL('/import.php?database='+encodeURIComponent(database.value),location.href).href});
      if(response.exitCode!==0)throw Error(decoder.decode(response.stderr));message.textContent='Import SQL terminé.';dirty=true;
    } finally {for(const suffix of ['.php','.php.sql'])try{await hub.runtime.remove(tool+suffix);}catch{/* Preserve the original import error. */}}
  });
  if(saved?.table&&(!saved.viewDatabase||saved.viewDatabase===database.value)){
    try{await tables();if([...tableSelect.options].some(option=>option.value===saved.table)){tableSelect.value=saved.table;await browse(false);}}
    catch(error){message.textContent='Vue SQL non restaurée : '+error.message;}
  }
  return { snapshot: () => ({ query: query.value, database: database.value, table:editingTable, viewDatabase, page }) };
}
async function renderSchema(container, saved) {
  container.append($('#schema-template').content.cloneNode(true));
  const database = container.querySelector('.database'), svg = container.querySelector('svg'), message = container.querySelector('.message');
  let catalog=new Map();
  database.value = saved?.database ?? 'test'; const positions = saved?.positions ?? {}; const ns = 'http://www.w3.org/2000/svg';
  const element = (name, attrs = {}, text) => { const node = document.createElementNS(ns, name); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };
  const refresh = async () => {
    const columns = await rows(`SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,COLUMN_KEY,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=${literal(database.value)} ORDER BY TABLE_NAME,ORDINAL_POSITION`, database.value);
    const relations = await rows(`SELECT TABLE_NAME,REFERENCED_TABLE_NAME,COLUMN_NAME,REFERENCED_COLUMN_NAME,CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=${literal(database.value)} AND REFERENCED_TABLE_NAME IS NOT NULL`, database.value);
    const tables = new Map(); for (const row of columns.rows) { if (!tables.has(row[0])) tables.set(row[0], []); tables.get(row[0]).push(row); }
    for(const name of Object.keys(positions))if(!tables.has(name))delete positions[name];
    catalog=tables;
    for(const selector of ['.fk-from','.fk-to']){const select=container.querySelector(selector),current=select.value;select.replaceChildren(...[...tables.keys()].map(name=>Object.assign(document.createElement('option'),{value:name,textContent:name})));if(tables.has(current))select.value=current;}
    updateRelationColumns();
    if (tables.size > 50) throw Error('Le diagramme est limité à 50 tables.');
    svg.replaceChildren(); let i = 0;
    let rowY=30,rowHeight=0; for (const [name,fields] of tables) { if(i && i%3===0){rowY+=rowHeight+30;rowHeight=0;} positions[name] ??= {x:30+i%3*350,y:rowY}; rowHeight=Math.max(rowHeight,45+fields.length*18); i++; }
    const lines = [];
    for (const [from,to,column,referenced,constraint] of relations.rows) if(tables.has(from)&&tables.has(to)) {
      const line=element('line'),label=element('text',{class:'relation-label'},`${constraint}: ${column} → ${referenced}`);
      line.append(element('title',{},`${from}.${column} → ${to}.${referenced}`));svg.append(line,label);
      const fromIndex=tables.get(from).findIndex(field=>field[1]===column),toIndex=tables.get(to).findIndex(field=>field[1]===referenced);
      lines.push({line,label,from,to,fromIndex,toIndex});
    }
    const updateLines=()=>lines.forEach(({line,label,from,to,fromIndex,toIndex})=>{
      const x1=positions[from].x+300,y1=positions[from].y+41+fromIndex*18,x2=positions[to].x,y2=positions[to].y+41+toIndex*18;
      for(const [key,value] of Object.entries({x1,y1,x2,y2}))line.setAttribute(key,value);
      label.setAttribute('x',(x1+x2)/2);label.setAttribute('y',(y1+y2)/2-5);
    });
    for (const [name, fields] of tables) {
      const group = element('g', { transform: `translate(${positions[name].x},${positions[name].y})` });
      group.append(element('rect', { width: 300, height: 45 + fields.length * 18 }), element('text', { x: 12, y: 24 }, name));
      fields.forEach((field, index) => group.append(element('text', { x: 12, y: 46 + index * 18 }, `${field[3]==='PRI'?'◆ ':field[3]==='MUL'?'◇ ':''}${field[1]} : ${field[2]}${field[4]==='NO'?' NOT NULL':''}`)));
      group.onpointerdown = event => { group.setPointerCapture(event.pointerId); const box = svg.getBoundingClientRect(), scale = svg.viewBox.baseVal.width / box.width; const start = { x: event.clientX, y: event.clientY, ...positions[name] };
        group.onpointermove = move => { positions[name] = { x: Math.max(0, start.x + (move.clientX - event.clientX) * scale), y: Math.max(0, start.y + (move.clientY - event.clientY) * scale) }; group.setAttribute('transform', `translate(${positions[name].x},${positions[name].y})`); updateLines(); };
        group.onpointerup = () => { group.onpointermove = null; };
      };
      svg.append(group);
    }
    updateLines(); svg.setAttribute('viewBox', `0 0 ${Math.max(1100,...[...tables.keys()].map(name=>positions[name].x+330))} ${Math.max(350,...[...tables].map(([name,fields])=>positions[name].y+75+fields.length*18))}`); message.textContent = `${tables.size} tables · ${relations.rows.length} relations`;
  };
  function updateRelationColumns(){
    for(const [tableName,columnName] of [['.fk-from','.fk-column'],['.fk-to','.fk-reference']]){
      const select=container.querySelector(columnName),current=select.value;
      select.replaceChildren(...(catalog.get(container.querySelector(tableName).value)??[]).map(field=>Object.assign(document.createElement('option'),{value:field[1],textContent:field[1]+' · '+field[2]})));
      if([...select.options].some(option=>option.value===current))select.value=current;
    }
  }
  container.querySelector('.fk-from').onchange=updateRelationColumns;container.querySelector('.fk-to').onchange=updateRelationColumns;
  container.querySelector('.fk-add').onclick=()=>action(async()=>{
    const value=selector=>container.querySelector(selector).value;
    if(!value('.fk-from')||!value('.fk-to')||!value('.fk-column')||!value('.fk-reference'))throw Error('Lisez le schéma et choisissez les colonnes.');
    const onDelete=value('.fk-delete');if(!['RESTRICT','CASCADE','SET NULL'].includes(onDelete))throw Error('Action référentielle invalide.');
    const ddl=`ALTER TABLE ${identifier(value('.fk-from'))} ADD CONSTRAINT ${identifier('fk_'+crypto.randomUUID().replaceAll('-',''))} FOREIGN KEY (${identifier(value('.fk-column'))}) REFERENCES ${identifier(value('.fk-to'))} (${identifier(value('.fk-reference'))}) ON DELETE ${onDelete}`;
    container.querySelector('.ddl').value=ddl;await rows(ddl,database.value);dirty=true;await refresh();
  });
  container.querySelector('.refresh').onclick = () => action(refresh);
  container.querySelector('.apply').onclick = () => action(async () => { await rows(container.querySelector('.ddl').value, database.value); dirty = true; await refresh(); });
  return { snapshot: () => ({ database: database.value, positions }) };
}
const renderers = { editor: renderEditor, sql: renderSQL, schema: renderSchema };
async function setTool(name, mode) {
  const tool = tools.get(name) ?? { mode: 'unloaded', view: null }; tools.set(name, tool);
  const container = $('#' + name + '-tool');
  if (!hub) { container.textContent = 'Ouvrez un projet.'; return; }
  if (mode === 'unloaded') {
    if (tool.view) await writeState('tool:' + hub.key + ':' + name, tool.view.snapshot());
    if (name === 'sql') await hub.runtime.closeConsole();
    container.replaceChildren(Object.assign(document.createElement('p'), { className: 'unloaded', textContent: 'Outil déchargé — brouillon conservé.' })); tool.view = null;
  } else {
    if (!tool.view) { container.replaceChildren(); tool.view = await renderers[name](container, await readState('tool:' + hub.key + ':' + name)); }
    container.classList.toggle('idle', mode === 'idle'); container.querySelectorAll('input,select,textarea,button').forEach(element => { element.disabled = mode === 'idle'; });
  }
  tool.mode = mode;
}
function refreshSessions() { $('#sessions').replaceChildren(...[...hub.sessions.sessions.values()].map(session => Object.assign(document.createElement('option'), { value: session.id, textContent: session.label }))); }
async function updateEngine() {
  if(!hub)return;
  const state=await hub.runtime.state(),label=$('#engine-state');
  label.dataset.linearMemoryBytes=state.linearMemoryBytes;
  label.dataset.allocatorUsedBytes=state.allocatorUsedBytes??'';
  label.textContent=`SQL ${state.sqlStarted?'actif':'arrêté'} · ${state.allocatorUsedBytes===null?'':`tas occupé ${(state.allocatorUsedBytes/1048576).toFixed(0)} Mio · `}capacité WASM ${(state.linearMemoryBytes/1048576).toFixed(0)} Mio`;
  label.title='Le tas occupé et la capacité WASM sont distincts de la RAM résidente du navigateur.';
}
async function openProject() {
  const key = $('#project').value; if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) throw Error('Nom de projet : lettres, chiffres, tirets et underscore, 64 caractères maximum.');
  status('Ouverture du projet…');$('main').inert=true;$('#open').disabled=true;
  try{
    if (hub) { for (const name of tools.keys()) await setTool(name, 'unloaded'); await hub.close(); }
    hub = await ProjectHub.open(key); dirty = false;
    navigator.serviceWorker.controller.postMessage({ type: 'pbl-owner', project: key });
    for (const id of ['save','close','window','new-client','demo','export','import-files','stop-sql']) $('#' + id).disabled = false;
    refreshSessions(); for (const select of document.querySelectorAll('[data-tool]')) { select.value = 'active'; await setTool(select.dataset.tool, 'active'); }
    await updateEngine(); status('Projet prêt. SQL démarre uniquement si nécessaire.');
  }finally{$('main').inert=false;$('#open').disabled=false;}
}
navigator.serviceWorker.addEventListener('message', event => {
  const reply = (ok, value, error) => { const transfers = value?.body ? [value.body.buffer] : []; event.ports[0]?.postMessage({ ok, value, error }, transfers); };
  const data = event.data;
  if (data?.type === 'pbl-discover') { reply(true, !!hub && hub.key === data.project); return; }
  if (!hub) { reply(false, null, 'Projet fermé'); return; }
  if (data?.type === 'pbl-route') hub.route(data.session, data.request).then(value => { dirty = true; reply(true, value); updateEngine().catch(() => {}); }, error => reply(false, null, error.message));
  if (data?.type === 'pbl-cookie') hub.setCookie(data.session, data.value, data.url).then(value => reply(true, value), error => reply(false, null, error.message));
});
$('#open').onclick = () => action(openProject);
$('#save').onclick = () => action(async () => { status('Sauvegarde du projet…'); for (const [name, tool] of tools) if (tool.view) await writeState('tool:' + hub.key + ':' + name, tool.view.snapshot()); await hub.saveAndRestart(); dirty = false; await updateEngine(); status('Fichiers et transactions validées sauvegardés.'); });
$('#close').onclick = () => action(async () => { for (const name of tools.keys()) await setTool(name, 'unloaded'); await hub.close(); navigator.serviceWorker.controller.postMessage({ type: 'pbl-release', project: hub.key }); hub = null; dirty = false; status('Projet fermé et sauvegardé.'); for (const id of ['save','close','window','new-client','demo','export','import-files','stop-sql']) $('#' + id).disabled = true; });
$('#stop-sql').onclick = () => action(async () => { await hub.runtime.closeConsole(); await hub.runtime.stopSQL(); await updateEngine(); status('SQL arrêté. PHP et les fichiers restent disponibles.'); });
function openWindow(independent) {
  if (!hub) return;
  const popup = window.open('about:blank', '_blank');
  if (!popup) { status('Autorisez les fenêtres pour ouvrir un client.', true); return; }
  action(async () => { const id = independent ? await hub.createSession() : $('#sessions').value; refreshSessions(); $('#sessions').value = id; popup.location.href = hub.routeURL(id, $('#preview-path').value); });
}
$('#window').onclick = () => openWindow(false); $('#new-client').onclick = () => openWindow(true);
for (const select of document.querySelectorAll('[data-tool]')) select.onchange = () => action(() => setTool(select.dataset.tool, select.value));
$('#import-files').onchange = () => action(async () => { for (const file of $('#import-files').files) { const name = file.webkitRelativePath || file.name; if (/\.zip$/i.test(name)) { const { readZip } = await import('./zip.mjs'); for (const entry of await readZip(new Uint8Array(await file.arrayBuffer()))) await hub.runtime.write('/workspace/' + entry.name, entry.bytes); } else await hub.runtime.write('/workspace/' + name, new Uint8Array(await file.arrayBuffer())); } dirty = true; await setTool('editor', 'unloaded'); await setTool('editor', 'active'); status('Fichiers importés.'); });
$('#demo').onclick = () => action(async () => { const demo = await import('./school-demo.mjs'); for (const [name, text] of Object.entries(demo.files)) { try { await hub.runtime.read('/workspace/' + name); throw Error('Le fichier ' + name + ' existe déjà. Utilisez un projet vide.'); } catch (error) { if (error.message.includes('existe déjà')) throw error; } await hub.runtime.write('/workspace/' + name, text); } dirty = true; await setTool('editor', 'unloaded'); await setTool('editor', 'active'); status('Exemple chargé. Ouvrez une fenêtre cliente.'); });
$('#export').onclick = () => action(async () => { const entries = []; for (const name of await files()) entries.push({ name: name.slice(1), bytes: await hub.runtime.read('/workspace' + name) }); const { makeZip } = await import('./zip.mjs'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([makeZip(entries)], { type: 'application/zip' })); link.download = hub.key + '.zip'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); });
window.addEventListener('beforeunload', event => { if (hub && dirty) { event.preventDefault(); event.returnValue = ''; } });
const params = new URLSearchParams(location.search); if (params.has('project')) $('#project').value = params.get('project');
const registration = await navigator.serviceWorker.register('/service-worker.js', { type: 'module', scope: '/' });
await navigator.serviceWorker.ready;
if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
for (const name of Object.keys(renderers)) await setTool(name, 'unloaded');
status('Prêt à ouvrir un projet.');
