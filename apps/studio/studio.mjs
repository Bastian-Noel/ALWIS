import { ProjectHub } from './project-hub.mjs';
import { readState, writeState } from './state.mjs';
const $ = selector => document.querySelector(selector), decoder = new TextDecoder();
let hub, dirty = false, operation = Promise.resolve();
const tools = new Map();
function status(text, error = false) { $('#status').textContent = text; $('#status').toggleAttribute('data-error', error); }
function action(task) { operation = operation.then(task).catch(error => status(error.message, true)); return operation; }
const identifier = value => '`' + String(value).replace(/`/g, '``') + '`';
const literal = value => {
  if (value === null) return 'NULL';
  const hex = [...(value instanceof Uint8Array ? value : new TextEncoder().encode(String(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return value instanceof Uint8Array ? `X'${hex}'` : `CONVERT(X'${hex}' USING utf8mb4)`;
};
const display = value => value === null ? 'NULL' : value instanceof Uint8Array ? literal(value) : String(value);
async function rows(sql, database) { return hub.runtime.sql(sql, database); }
async function files(path = '/workspace', depth = 0) {
  if (depth > 12) throw Error('Arborescence trop profonde');
  const output = [];
  for (const name of await hub.runtime.list(path)) {
    if (name.startsWith('.')) continue;
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
  let result, page = 0, editingTable, primaryKeys = [];
  const draw = () => {
    grid.replaceChildren();
    if (!result) return;
    const table = document.createElement('table'), head = table.createTHead().insertRow();
    result.columns.forEach(column => { const cell = document.createElement('th'); cell.textContent = column.name; head.append(cell); });
    const body = table.createTBody();
    for (const row of result.rows.slice(page * 100, page * 100 + 100)) {
      const tr = body.insertRow();
      row.forEach((value, index) => {
        const cell = tr.insertCell(); cell.textContent = display(value);
        if (editingTable && primaryKeys.length) {
          cell.dataset.editable = '';
          cell.ondblclick = () => { const input = document.createElement('input'); input.value = value === null ? '' : display(value); cell.replaceChildren(input); input.focus(); input.onkeydown = event => {
            if (event.key === 'Escape') draw();
            if (event.key === 'Enter') action(async () => {
              const where = primaryKeys.map(key => identifier(key) + '=' + literal(row[result.columns.findIndex(column => column.name === key)])).join(' AND ');
              await rows(`UPDATE ${identifier(editingTable)} SET ${identifier(result.columns[index].name)}=${literal(input.value)} WHERE ${where}`, database.value); dirty = true; await browse();
            });
          }; };
        }
      });
    }
    grid.append(table); container.querySelector('.page').textContent = `${page + 1} / ${Math.max(1, Math.ceil(result.rows.length / 100))}`;
    container.querySelector('.previous').disabled = page === 0; container.querySelector('.next').disabled = (page + 1) * 100 >= result.rows.length;
  };
  const execute = async () => { editingTable = undefined; result = await rows(query.value, database.value); dirty = true; page = 0; message.textContent = `${result.rows.length} lignes · ${result.affectedRows} lignes affectées`; draw(); await updateEngine(); };
  const tables = async () => { const data = await rows('SHOW TABLES', database.value); tableSelect.replaceChildren(...data.rows.map(row => Object.assign(document.createElement('option'), { value: row[0], textContent: row[0] }))); };
  const browse = async () => {
    const name = tableSelect.value; if (!name) return;
    const keys = await rows(`SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=${literal(database.value)} AND TABLE_NAME=${literal(name)} AND CONSTRAINT_NAME='PRIMARY' ORDER BY ORDINAL_POSITION`, database.value);
    primaryKeys = keys.rows.map(row => row[0]); editingTable = name;
    result = await rows(`SELECT * FROM ${identifier(name)} LIMIT 1000`, database.value); page = 0;
    message.textContent = primaryKeys.length ? 'Double-cliquez une cellule pour la modifier. 1 000 lignes au maximum.' : 'Lecture seule : aucune clé primaire. 1 000 lignes au maximum.'; draw();
  };
  container.querySelector('.run').onclick = () => action(execute); container.querySelector('.tables').onclick = () => action(tables); container.querySelector('.browse').onclick = () => action(browse);
  container.querySelector('.previous').onclick = () => { page = Math.max(0, page - 1); draw(); }; container.querySelector('.next').onclick = () => { page++; draw(); };
  const input = container.querySelector('.sql-file'); container.querySelector('.import-sql').onclick = () => input.click();
  input.onchange = () => action(async () => {
    const file = input.files[0]; if (!file) return;
    if (file.size > 8 * 1024 * 1024) throw Error('Import SQL limité à 8 Mio.');
    const tool = '/workspace/.pbl-import-' + crypto.randomUUID();
    await hub.runtime.write(tool + '.sql', new Uint8Array(await file.arrayBuffer()));
    await hub.runtime.write(tool + '.php', '<?php $db=new PDO("mysql:dbname=test;charset=utf8mb4","root",""); $db->exec(file_get_contents(__FILE__.".sql")); echo "ok";');
    await hub.runtime.rename(tool + '.sql', tool + '.php.sql');
    try { const response = await hub.runtime.request({ script: tool + '.php' }); if (response.exitCode !== 0) throw Error(decoder.decode(response.stderr)); message.textContent = 'Import SQL terminé.'; dirty = true; }
    finally { await hub.runtime.remove(tool + '.php'); await hub.runtime.remove(tool + '.php.sql'); }
  });
  return { snapshot: () => ({ query: query.value, database: database.value }) };
}
async function renderSchema(container, saved) {
  container.append($('#schema-template').content.cloneNode(true));
  const database = container.querySelector('.database'), svg = container.querySelector('svg'), message = container.querySelector('.message');
  database.value = saved?.database ?? 'test'; const positions = saved?.positions ?? {}; const ns = 'http://www.w3.org/2000/svg';
  const element = (name, attrs = {}, text) => { const node = document.createElementNS(ns, name); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };
  const refresh = async () => {
    const columns = await rows(`SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=${literal(database.value)} ORDER BY TABLE_NAME,ORDINAL_POSITION`, database.value);
    const relations = await rows(`SELECT TABLE_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=${literal(database.value)} AND REFERENCED_TABLE_NAME IS NOT NULL`, database.value);
    const tables = new Map(); for (const row of columns.rows) { if (!tables.has(row[0])) tables.set(row[0], []); tables.get(row[0]).push(row); }
    if (tables.size > 50) throw Error('Le diagramme est limité à 50 tables.');
    svg.replaceChildren(); let i = 0;
    for (const [name] of tables) positions[name] ??= { x: 30 + i % 3 * 350, y: 30 + Math.floor(i++ / 3) * 230 };
    const lines = [];
    for (const [from, to] of relations.rows) if (positions[from] && positions[to]) { const line = element('line'); svg.append(line); lines.push({ line, from, to }); }
    const updateLines = () => lines.forEach(({ line, from, to }) => { for (const [key, value] of Object.entries({ x1: positions[from].x + 150, y1: positions[from].y + 20, x2: positions[to].x + 150, y2: positions[to].y + 20 })) line.setAttribute(key, value); });
    for (const [name, fields] of tables) {
      const group = element('g', { transform: `translate(${positions[name].x},${positions[name].y})` });
      group.append(element('rect', { width: 300, height: 45 + Math.min(fields.length, 8) * 18 }), element('text', { x: 12, y: 24 }, name));
      fields.slice(0, 8).forEach((field, index) => group.append(element('text', { x: 12, y: 46 + index * 18 }, `${field[1]} : ${field[2]}`)));
      group.onpointerdown = event => { group.setPointerCapture(event.pointerId); const box = svg.getBoundingClientRect(), scale = 1100 / box.width; const start = { x: event.clientX, y: event.clientY, ...positions[name] };
        group.onpointermove = move => { positions[name] = { x: Math.max(0, start.x + (move.clientX - event.clientX) * scale), y: Math.max(0, start.y + (move.clientY - event.clientY) * scale) }; group.setAttribute('transform', `translate(${positions[name].x},${positions[name].y})`); updateLines(); };
        group.onpointerup = () => { group.onpointermove = null; };
      };
      svg.append(group);
    }
    updateLines(); svg.setAttribute('viewBox', `0 0 1100 ${Math.max(350, ...Object.values(positions).map(position => position.y + 230))}`); message.textContent = `${tables.size} tables · ${relations.rows.length} relations`;
  };
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
async function updateEngine() { if (hub) { const state = await hub.runtime.state(); $('#engine-state').textContent = `SQL ${state.sqlStarted ? 'actif' : 'arrêté'} · capacité du moteur ${(state.linearMemoryBytes / 1048576).toFixed(0)} Mio`; } }
async function openProject() {
  const key = $('#project').value; if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) throw Error('Nom de projet : lettres, chiffres, tirets et underscore, 64 caractères maximum.');
  if (hub) { for (const name of tools.keys()) await setTool(name, 'unloaded'); await hub.close(); }
  status('Ouverture du projet…'); hub = await ProjectHub.open(key); dirty = false;
  navigator.serviceWorker.controller.postMessage({ type: 'pbl-owner', project: key });
  for (const id of ['save','close','window','new-client','demo','export','import-files','stop-sql']) $('#' + id).disabled = false;
  refreshSessions(); for (const select of document.querySelectorAll('[data-tool]')) { select.value = 'active'; await setTool(select.dataset.tool, 'active'); }
  await updateEngine(); status('Projet prêt. SQL démarre uniquement si nécessaire.');
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
