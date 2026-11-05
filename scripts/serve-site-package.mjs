/** Serve only the prepared public payload, with the headers required by WASM. */
import {createServer} from 'node:http';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.php':'text/plain; charset=utf-8','.png':'image/png'};
export function createSiteServer(root=resolve(fileURLToPath(new URL('../build-work/site',import.meta.url)))){
return createServer(async(request,response)=>{
 response.setHeader('Cross-Origin-Opener-Policy','same-origin');response.setHeader('Cross-Origin-Embedder-Policy','require-corp');response.setHeader('Cross-Origin-Resource-Policy','same-origin');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
 if(request.method!=='GET'&&request.method!=='HEAD'){response.writeHead(405).end();return;}
 try{
  const path=new URL(request.url,'http://localhost').pathname,filename=resolve(root,'.'+(decodeURIComponent(path)==='/'?'/index.html':decodeURIComponent(path)));
  if(!filename.startsWith(root+sep)){response.writeHead(404).end();return;}const info=await stat(filename);if(!info.isFile()){response.writeHead(404).end();return;}
  response.setHeader('Content-Type',mime[extname(filename)]??'text/plain; charset=utf-8');response.setHeader('Content-Length',info.size);if(path==='/service-worker.js')response.setHeader('Service-Worker-Allowed','/');if(request.method==='HEAD')response.end();else await pipeline(createReadStream(filename),response);
 }catch{if(!response.destroyed){if(response.headersSent)response.destroy();else response.writeHead(404).end();}}
});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
const server=createSiteServer();server.listen(Number(process.env.PBL_SITE_PORT??8090),'127.0.0.1',()=>console.log('Static studio package on port',server.address().port));
}
