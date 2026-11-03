const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export async function readFolder(directory){
 const files=new Map();let total=0;
 async function walk(dir,prefix='',depth=0){
  if(depth>12)throw Error('Dossier trop profond (12 niveaux maximum).');
  for await(const [name,entry] of dir.entries()){
   if(name.startsWith('.')||['node_modules','vendor'].includes(name))continue;
   const path=prefix+'/'+name;
   if(entry.kind==='directory')await walk(entry,path,depth+1);
   else {const f=await entry.getFile();total+=f.size;if(f.size>16*1048576||total>64*1048576||files.size>=1024)throw Error('Dossier limité à 64 Mio, 1 024 fichiers et 16 Mio par fichier.');files.set(path,new Uint8Array(await f.arrayBuffer()));}
  }
 }
 await walk(directory);return files;
}
export function folderWriter(directory,snapshots){
 return async(path,text)=>{
  const parts=path.split('/').slice(1);
  if(!parts.length||parts.some(p=>!p||p==='..'||p.startsWith('.')))throw Error('Chemin local réservé.');
  let dir=directory;for(const part of parts.slice(0,-1))dir=await dir.getDirectoryHandle(part,{create:true});
  const name=parts.at(-1);let handle,current;
  try{handle=await dir.getFileHandle(name);current=new Uint8Array(await(await handle.getFile()).arrayBuffer());}catch(e){if(e.name!=='NotFoundError')throw e;}
  const expected=snapshots.get(path);
  if((expected&&!current)||(current&&(!expected||!equal(current,expected))))throw Error('Le fichier du PC a changé : '+path+'. Rouvrez le dossier pour récupérer sa version.');
  handle??=await dir.getFileHandle(name,{create:true});const stream=await handle.createWritable();
  try{await stream.write(text);await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}
  snapshots.set(path,new TextEncoder().encode(text));
 };
}
