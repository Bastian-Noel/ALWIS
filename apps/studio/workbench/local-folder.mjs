import {A,S,ctx,eng} from './state.mjs';
import {toast} from './ui.mjs';
import {refreshFiles} from './views/explorer.mjs';
import {readFolder,folderWriter} from './folder-access.mjs';
A.openLocalFolder=async()=>{
 if(!globalThis.showDirectoryPicker)return toast('L’accès aux dossiers nécessite Chrome ou Edge sur ordinateur. Vous pouvez importer un ZIP.');
 if(S.project)return toast('Fermez le projet actuel avant d’ouvrir un dossier du PC.');
 try{
  const directory=await showDirectoryPicker({mode:'readwrite'}),files=await readFolder(directory);
  const name='dossier-'+crypto.randomUUID().slice(0,8);await A.open(name,'existing');if(!S.project)return;
  for(const [path,data]of files){await eng().fs.write(path,data);S.applied.add(path);}
  ctx.folder={name:directory.name,write:folderWriter(directory,files)};
  await refreshFiles();const first=S.files.find(f=>f.kind==='text');if(first)await A.openFile(first.path);
  ctx.draw();toast('Dossier '+directory.name+' : Enregistrer écrit aussi sur votre PC. Les suppressions et renommages restent dans le projet du navigateur.');
 }catch(e){if(e.name!=='AbortError')toast('Ouverture du dossier : '+e.message);}
};
