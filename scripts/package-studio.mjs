/** Static deployment payload only; excludes Git, source receipts and local projects. */
import {readdir,mkdir,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(new URL('..',import.meta.url).pathname),target=resolve(root,'build-work/site');
await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
const files=[];
async function copy(source,destination){const output=join(target,destination);await mkdir(resolve(output,'..'),{recursive:true});await copyFile(join(root,source),output);const data=await readFile(output);files.push({path:destination,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
for(const directory of ['apps/studio','packages/runtime/src'])for(const entry of await readdir(join(root,directory),{withFileTypes:true}))if(entry.isFile()&&/\.(mjs|js|css|html|php)$/.test(entry.name))await copy(directory+'/'+entry.name,directory+'/'+entry.name);
for(const name of ['pbl-runtime.mjs','pbl-runtime.wasm'])await copy('build-work/bridge/.native-build/engine/wasm/runtime-dist/'+name,'engine/'+name);
await copy('apps/studio/index.html','index.html');await copy('apps/studio/service-worker.mjs','service-worker.js');await copy('apps/studio/client-bootstrap.js','_pbl/client.js');
await writeFile(join(target,'_headers'),`/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: same-origin
  Cache-Control: no-cache
  X-Content-Type-Options: nosniff
/engine/*.wasm
  Content-Type: application/wasm
/service-worker.js
  Service-Worker-Allowed: /
`);
const serverSource=await readFile(join(root,'scripts/serve-site-package.mjs'),'utf8');
if(!serverSource.includes("new URL('../build-work/site',import.meta.url)"))throw Error('Static-server packaging anchor changed');
await writeFile(join(target,'serve.mjs'),serverSource.replace("new URL('../build-work/site',import.meta.url)","new URL('.',import.meta.url)").replace('??8090','??8080'));
await writeFile(join(target,'LIRE-MOI.txt'),`WASMWebServer — prototype de test\n\nPour un essai local : extrayez le ZIP, lancez « node serve.mjs » dans ce dossier, puis ouvrez http://127.0.0.1:8080. Node.js 20 ou plus récent est requis pour ce serveur de fichiers.\n\nPour publier : envoyez tout ce dossier sur un hébergement statique HTTPS avec COOP: same-origin et COEP: require-corp. Le fichier _headers contient la configuration pour les hébergeurs compatibles. Le fichier WASM doit être servi en application/wasm. Il n'y a aucun serveur PHP distant : PHP et MariaDB s'exécutent dans le navigateur.\n\nTest : ouvrez un projet vide, chargez l'exemple scolaire, puis utilisez Clients pour ouvrir une fenêtre. Les six onglets, le journal et les outils SQL sont disponibles. L'éditeur est encore une édition texte sans services de langage. Sauvegardez le projet pour conserver fichiers et SQL dans ce navigateur.\n\nCette archive contient uniquement les ressources web du prototype. Les projets créés restent dans le stockage du navigateur et ne sont pas inclus dans cette archive.\n`);
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
await writeFile(join(target,'release.json'),JSON.stringify({builtAt:new Date().toISOString(),revision,workingChanges:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),scope:'Static prototype. PHP and MariaDB execute in the browser; project data stays in browser storage.',files},null,2)+'\n');
console.log(JSON.stringify({directory:relative(root,target),files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),revision}));
