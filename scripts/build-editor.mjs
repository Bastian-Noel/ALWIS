import {execFileSync} from 'node:child_process';
/** Bundle pinned editor dependencies locally; never require a CDN at runtime. */
import {build} from 'esbuild';
import {mkdir,copyFile,writeFile,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
execFileSync(python,['scripts/fetch-editor-engines.py'],{stdio:'inherit'});
const out='apps/studio/editor/dist';await mkdir(out,{recursive:true});
// The PHP standalone plugin imports Node helpers only for Composer discovery.
// Browser formatting fixes phpVersion explicitly and never reads the host filesystem.
const formatterBrowserHost={name:'no-host-filesystem',setup(b){
  b.onResolve({filter:/^(fs|path)$/},()=>({path:'host-filesystem',namespace:'browser-only'}));
  b.onLoad({filter:/.*/,namespace:'browser-only'},()=>({contents:'export default {}',loader:'js'}));
}};
for(const [entry,name] of [['apps/studio/editor/codemirror.mjs','codemirror'],['apps/studio/editor/javascript-worker.mjs','javascript-worker'],['apps/studio/editor/lsp-worker.mjs','lsp-worker'],['apps/studio/editor/formatter-worker.mjs','formatter-worker']])await build({entryPoints:[entry],outfile:`${out}/${name}.mjs`,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof',plugins:name==='formatter-worker'?[formatterBrowserHost]:[]});
for(const [from,to] of [['node_modules/@swc/wasm-web/wasm_bg.wasm','swc.wasm'],['build-work/editor-upstream/superhtml.wasm','superhtml.wasm'],['build-work/editor-upstream/phpantom_lsp.wasm','php-lsp.wasm']])await copyFile(from,`${out}/${to}`);
const definitions={};
const libraries=new Set(['lib.es2022.d.ts','lib.dom.d.ts']);
for(const name of libraries){const text=await readFile('node_modules/typescript/lib/'+name,'utf8');definitions['/.pbl-types/'+name]=text;for(const match of text.matchAll(/<reference lib="([^"]+)"/g))libraries.add('lib.'+match[1]+'.d.ts');}
for(const pkg of ['jquery','sizzle'])for(const name of await readdir('node_modules/@types/'+pkg))if(name.endsWith('.d.ts'))definitions[`/.pbl-types/node_modules/@types/${pkg}/${name}`]=await readFile(`node_modules/@types/${pkg}/${name}`,'utf8');
await writeFile(`${out}/definitions.json`,JSON.stringify(definitions));
const packages=JSON.parse(await readFile('package.json','utf8')).dependencies;let notices='ALWIS editor dependencies\n\n';
for(const name of Object.keys(packages)){for(const file of ['LICENSE','LICENSE.txt','license']){try{notices+=name+' '+packages[name]+'\n'+await readFile('node_modules/'+name+'/'+file,'utf8')+'\n\n';break;}catch(error){if(error.code!=='ENOENT')throw error;}}}
// The PHP standalone formatter embeds these distributions and their notices.
for(const name of ['php-parser','linguist-languages'])for(const file of ['LICENSE','ThirdPartyNoticeText.txt']){
  try{notices+=name+' — '+file+'\n'+await readFile('node_modules/'+name+'/'+file,'utf8')+'\n\n';}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
for(const name of await readdir('apps/studio/editor/licenses'))notices+=name+'\n'+await readFile('apps/studio/editor/licenses/'+name,'utf8')+'\n';
await writeFile(out+'/THIRD-PARTY.txt',notices);
const files=[];for(const name of await readdir(out)){const data=await readFile(out+'/'+name);files.push({name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
await writeFile('apps/studio/editor/ASSETS.json',JSON.stringify({sources:{phpLsp:'https://github.com/PHPantom-dev/phpantom_lsp/releases/tag/0.11.1',superhtml:'https://github.com/kristoff-it/superhtml/releases/tag/v0.7.1'},files},null,2)+'\n');
console.log('Editor assets built:',files.length,'files');
