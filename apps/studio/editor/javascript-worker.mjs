import ts from 'typescript';
import initSWC,{parseSync} from '@swc/wasm-web';
const MAX_DOCUMENT=256*1024;
let settings;
let swcRuntime;
let initialization,service,versions=new Map(),documents=new Map(),activePath;
async function initialize(){
 const response=await fetch(new URL('./definitions.json',import.meta.url));if(!response.ok)throw Error('Définitions de types indisponibles. Réactivez l’éditeur.');
 const definitions=await response.json();for(const [name,text]of Object.entries(definitions))documents.set(name,text);
 settings={allowJs:true,checkJs:true,noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,lib:['/.pbl-types/lib.es2022.d.ts','/.pbl-types/lib.dom.d.ts'],typeRoots:['/.pbl-types/node_modules/@types'],types:['jquery']};
 service=ts.createLanguageService({getCompilationSettings:()=>({...settings,types:[...settings.types]}),getScriptFileNames:()=>[activePath,...[...documents.keys()].filter(p=>p.startsWith('/project/')&&p.endsWith('.d.ts'))],getScriptVersion:p=>String(versions.get(p)??0),getScriptSnapshot:p=>documents.has(p)?ts.ScriptSnapshot.fromString(documents.get(p)):undefined,getCurrentDirectory:()=>'/project',getDefaultLibFileName:()=>'/.pbl-types/lib.es2022.d.ts',fileExists:p=>documents.has(p),readFile:p=>documents.get(p),readDirectory:()=>[],directoryExists:p=>[...documents.keys()].some(n=>n.startsWith(p+'/')),getDirectories:()=>[]});
 swcRuntime=await initSWC({module_or_path:new URL('./swc.wasm',import.meta.url)});
}
self.onmessage=async({data})=>{
 try{
  initialization??=initialize();await initialization;
  const {id,path,text,position,operation,projectDefinitions}=data;
  if(typeof text!=='string'||text.length>MAX_DOCUMENT)throw Error('Analyse limitée à 256 K caractères par document.');
  if(activePath&&activePath!==path){documents.delete(activePath);versions.delete(activePath);}activePath=path;
  for(const name of [...documents.keys()])if(name.startsWith('/project/')&&name.endsWith('.d.ts'))documents.delete(name);
  settings.types=projectDefinitions&&Object.values(projectDefinitions).some(t=>/interface\s+JQuery|declare\s+(?:var|const|let)\s+(?:\$|jQuery)\s*:/.test(t))?[]:['jquery'];
  if(projectDefinitions)for(const [name,value]of Object.entries(projectDefinitions).slice(0,32))if(name.endsWith('.d.ts')&&value.length<=65536){documents.set('/project'+name,value);versions.set('/project'+name,(versions.get('/project'+name)??0)+1);}
  documents.set(path,text);versions.set(path,(versions.get(path)??0)+1);
  if(operation==='complete'){
   const completion=service.getCompletionsAtPosition(path,position,{includeCompletionsWithInsertText:true});
   const entries=(completion?.entries??[]).slice(0,100).map(item=>({label:item.name,type:item.kind==='method'?'function':item.kind==='property'?'property':'variable',detail:ts.displayPartsToString(service.getCompletionEntryDetails(path,position,item.name,{},undefined,{},undefined)?.displayParts??[]).slice(0,400)}));
   self.postMessage({id,result:entries,wasmMemoryBytes:swcRuntime.memory.buffer.byteLength});return;
  }
  let syntax=[];
  try{parseSync(text,{syntax:path.endsWith('.ts')?'typescript':'ecmascript',jsx:path.endsWith('.jsx'),target:'es2022'});}catch(error){syntax=[{from:0,to:Math.min(text.length,1),severity:'error',message:String(error).replace(/\u001b\[[0-9;]*m/g,'').slice(0,1600)}];}
  const diagnostics=service.getSyntacticDiagnostics(path).concat(service.getSemanticDiagnostics(path)).slice(0,60).filter(d=>!d.file||d.file.fileName===path).map(d=>({from:d.start??0,to:(d.start??0)+(d.length??1),severity:d.category===ts.DiagnosticCategory.Error?'error':'warning',message:ts.flattenDiagnosticMessageText(d.messageText,'\n').slice(0,1600)}));
  self.postMessage({id,result:diagnostics.length?diagnostics:syntax,wasmMemoryBytes:swcRuntime.memory.buffer.byteLength});
 }catch(error){self.postMessage({id:data.id,error:error.message});}
};
