/** Static deployment payload only; excludes Git, source receipts and local projects. */
import {readdir,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),target=resolve(root,'build-work/site');
await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const assetBase='/_alwis/'+revision;
const files=[];
async function copy(source,destination){
  const publicPath=['index.html','service-worker.js','guest-sw.js','guest-broker.mjs','guest-broker.html','social-card.png','LICENSE.md','NOTICE.md','THIRD-PARTY-NOTICES.md','RELEASE-LICENSING-STATUS.json'].includes(destination)||destination.startsWith('LICENSES/')?destination:assetBase.slice(1)+'/'+destination;
  const output=join(target,publicPath);await mkdir(resolve(output,'..'),{recursive:true});
  let data=await readFile(join(root,source));
  if(/\.(mjs|js|css|html)$/.test(source)){
    let text=data.toString('utf8');
    // Relative imports already resolve inside this build. Rewriting their '/packages/'
    // suffix would duplicate the build prefix and break the static application.
    for(const prefix of ['/apps/studio/','/packages/runtime/','/engine/','/_pbl/client.js']){
      // Guest-origin bootstrap is hosted at the root of the isolated hostname.
      if (destination === 'guest-sw.js' && prefix === '/_pbl/client.js') continue;
      const escaped=prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      text=text.replaceAll(new RegExp('(?<![.\\w/-])'+escaped,'g'),assetBase+prefix);
    }
    if(source.endsWith('.html'))text=text.replace('<head>','<head><meta name="alwis-build" content="'+revision+'"><meta name="alwis-version" content="'+version+'">');
    data=Buffer.from(text);
  }
  await writeFile(output,data);files.push({path:publicPath,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
for(const directory of ['apps/studio','packages/runtime/src'])for(const entry of await readdir(join(root,directory),{withFileTypes:true}))if(entry.isFile()&&/\.(mjs|js|css|html)$/.test(entry.name))await copy(directory+'/'+entry.name,directory+'/'+entry.name);
for(const dir of ['workbench','workbench/views','collab'])for(const entry of await readdir(join(root,'apps/studio/'+dir)))if(/\.(mjs|css)$/.test(entry))await copy('apps/studio/'+dir+'/'+entry,'apps/studio/'+dir+'/'+entry);
for(const entry of await readdir(join(root,'apps/studio/database')))if(/\.mjs$/.test(entry))await copy('apps/studio/database/'+entry,'apps/studio/database/'+entry);
await copy('apps/studio/database/sql-export.php','apps/studio/sql-export.source.txt');
for(const name of ['codemirror.mjs','formatter-worker.mjs','definitions.json','javascript-worker.mjs','lsp-worker.mjs','php-lsp.wasm','superhtml.wasm','swc.wasm','THIRD-PARTY.txt'])await copy('apps/studio/editor/dist/'+name,'apps/studio/editor/dist/'+name);
for(const name of ['pbl-runtime.mjs','pbl-runtime.wasm'])await copy('build-work/bridge/.native-build/engine/wasm/runtime-dist/'+name,'engine/'+name);
// License obligations accompany the EXACT bytes served to every browser.
for(const entry of await readdir(join(root,'LICENSES'),{withFileTypes:true}))if(entry.isFile())await copy('LICENSES/'+entry.name,'LICENSES/'+entry.name);
for(const name of ['LICENSE.md','NOTICE.md','THIRD-PARTY-NOTICES.md'])await copy(name,name);
await copy('provenance/release-licensing-status.json','RELEASE-LICENSING-STATUS.json');
await copy('apps/studio/social-card.png','social-card.png');
await copy('apps/studio/index.html','index.html');await copy('apps/studio/service-worker.mjs','service-worker.js');await copy('apps/studio/client-bootstrap.js','_pbl/client.js');
// Keep the original versioned bootstrap for studio previews and add an
// unversioned copy for the isolated preview origin (which cannot expose _alwis).
const rawPreviewClient = await readFile(join(root,'apps/studio/client-bootstrap.js'));
await mkdir(join(target,'_pbl'),{recursive:true});
await writeFile(join(target,'_pbl/client.js'),rawPreviewClient);
files.push({path:'_pbl/client.js',bytes:rawPreviewClient.length,sha256:createHash('sha256').update(rawPreviewClient).digest('hex')});
await copy('apps/studio/collab/isolated-preview-sw.mjs','guest-sw.js');
await copy('apps/studio/collab/isolated-preview-broker.mjs','guest-broker.mjs');
const brokerHTML = Buffer.from('<!doctype html><html lang="fr"><meta charset="utf-8"><title>ALWIS · relais invité</title><script type="module" src="/guest-broker.mjs"></script></html>');
await writeFile(join(target,'guest-broker.html'),brokerHTML);
files.push({path:'guest-broker.html',bytes:brokerHTML.length,sha256:createHash('sha256').update(brokerHTML).digest('hex')});
await writeFile(join(target,'_headers'),`/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: same-origin
  Cache-Control: no-cache
  X-Content-Type-Options: nosniff
/_alwis/*/engine/*.wasm
  Content-Type: application/wasm
/service-worker.js
  Service-Worker-Allowed: /
`);
const serverSource=await readFile(join(root,'scripts/serve-site-package.mjs'),'utf8');
if(!serverSource.includes("new URL('../build-work/site',import.meta.url)"))throw Error('Static-server packaging anchor changed');
await writeFile(join(target,'serve.mjs'),serverSource.replace("new URL('../build-work/site',import.meta.url)","new URL('.',import.meta.url)").replace('??8090','??8080'));
await writeFile(join(target,'LIRE-MOI.txt'),`ALWIS — atelier web de test\n\nPour un essai local : extrayez le ZIP, lancez « node serve.mjs » dans ce dossier, puis ouvrez http://127.0.0.1:8080. Node.js 20 ou plus récent est requis pour ce serveur de fichiers.\n\nPour publier : envoyez tout ce dossier sur un hébergement statique HTTPS avec COOP: same-origin et COEP: require-corp. Le fichier _headers contient la configuration pour les hébergeurs compatibles. Le fichier WASM doit être servi en application/wasm. Il n'y a aucun serveur PHP distant : PHP et MariaDB s'exécutent dans le navigateur.\n\nTest : choisissez l’exemple scolaire à l’accueil, créez le projet, puis utilisez Aperçu ou Sessions pour ouvrir le site. Les espaces Code, Données, Schéma et Sessions ainsi que le panneau Serveur sont disponibles. CodeMirror 6 et les services PHP/HTML/JavaScript sont chargés au besoin. Sauvegardez le projet pour conserver fichiers et SQL dans ce navigateur.\n\nCette archive contient uniquement les ressources web du prototype. Les projets créés restent dans le stockage du navigateur et ne sont pas inclus dans cette archive.\n`);
for(const generated of ['_headers','serve.mjs','LIRE-MOI.txt']){
  const data=await readFile(join(target,generated));
  files.push({path:generated,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
await writeFile(join(target,'release.json'),JSON.stringify({builtAt:new Date().toISOString(),revision,version,assetBase,workingChanges:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),scope:'Static prototype. PHP and MariaDB execute in the browser; project data stays in browser storage.',files},null,2)+'\n');
console.log(JSON.stringify({directory:relative(root,target),files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),revision}));
