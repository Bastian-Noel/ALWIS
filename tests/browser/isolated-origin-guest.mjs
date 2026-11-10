/** Browser proof: a separate preview origin supports SW, JS and fetch without studio DOM access. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const pw = await import(pathToFileURL(resolve(root,"build-work/php/node_modules/playwright/index.mjs")).href);
const studio = createServer((_req,res) => {
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.end("<!doctype html><title>Trusted Studio Test</title><h1>Studio</h1>");
});
const guest = createServer(async(req,res) => {
  const p = new URL(req.url,"http://localhost").pathname;
  res.setHeader("Cross-Origin-Resource-Policy","cross-origin");
  res.setHeader("Cache-Control","no-store");
  if(p === "/guest-broker.html") {
    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.end('<!doctype html><meta charset="utf-8"><script type="module" src="/guest-broker.mjs"></script>');
  } else if (p === "/guest-sw.js" || p === "/guest-broker.mjs") {
    res.setHeader("Content-Type","text/javascript; charset=utf-8");
    res.setHeader("Service-Worker-Allowed","/");
    const file = p === "/guest-sw.js" ? "isolated-preview-sw.mjs" : "isolated-preview-broker.mjs";
    res.end(await readFile(resolve(root,"apps/studio/collab",file)));
  } else { res.writeHead(404); res.end("GUEST STATIC SERVER HAS NO PHP"); }
});
await Promise.all([studio,guest].map(server=>new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))));
const studioOrigin = "http://127.0.0.1:" + studio.address().port;
const guestOrigin = "http://127.0.0.1:" + guest.address().port;
const content = '<!doctype html><html><head><title>Untrusted PHP</title></head><body><h1>Guest PHP from host</h1><script>\n'
  +'const send = (kind, value) => parent.postMessage({from:"guest-site",kind,value},"*");\n'
  +'let stolen=false;try{void parent.document.body.innerHTML;stolen=true;}catch(e){}\n'
  +'send("isolation",{stolen,origin:location.origin});\n'
  +'fetch("/data.php").then(r=>r.text()).then(v=>send("fetch",v)).catch(e=>send("fetch-error",e.message));\n'
  +'</script><form action="/post.php" method="post"><input name="message" value="hello"><button id="post" type="submit">POST</button></form></body></html>';
try {
  for(const name of (process.argv[2]??"chromium,firefox").split(",")) {
    const browser = await pw[name].launch({headless:true,...(name==="chromium"?{args:["--no-sandbox"]}:{})});
    try {
      const page = await browser.newPage();
      const errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      page.on("console",m=>{ if(m.type()==="error") errors.push(m.text()); });
      await page.goto(studioOrigin);
      const info = await page.evaluate(({guestOrigin,studioOrigin,content}) => {
        const channel="a".repeat(32), frames={}; const requests=[];
        window.previewProof={messages:[],requests};
        window.addEventListener("message",async event=>{
          if(event.origin===guestOrigin && event.source===frames.broker?.contentWindow && event.data?.channel===channel) {
            if(event.data.type==="alwis-preview-ready") {
              const iframe=document.createElement("iframe");
              iframe.id="preview";iframe.setAttribute("sandbox","allow-scripts allow-same-origin allow-forms");
              iframe.src=guestOrigin+"/__alwis-guest/"+channel+"/index.php";
              frames.preview=iframe;document.body.append(iframe);
            } else if(event.data.type==="alwis-preview-http") {
              const port=event.ports?.[0],request=event.data.request;
              requests.push({url:request.url,method:request.method});
              const path=new URL(request.url).pathname;
              const body=path==="/index.php"?content:path==="/data.php"?"HTTP-RESPONSE-FROM-HOST"
                :path==="/post.php"?'<script>parent.postMessage({from:"guest-site",kind:"post",value:"DONE"},"*")</script>':"NOT-FOUND";
              port.postMessage({ok:true,response:{status: ["/index.php","/data.php","/post.php"].includes(path)?200:404,
                 headers:[["Content-Type",["/index.php","/post.php"].includes(path)?"text/html; charset=utf-8":"text/plain"]],
                 body:new TextEncoder().encode(body)}});
            }
          }
          if(event.data?.from==="guest-site") window.previewProof.messages.push(event.data);
        });
        const broker=document.createElement("iframe");
        broker.id="broker";broker.setAttribute("sandbox","allow-scripts allow-same-origin");
        broker.src=guestOrigin+"/guest-broker.html?channel="+channel+"&studioOrigin="+encodeURIComponent(studioOrigin);
        frames.broker=broker;document.body.append(broker);
        return {channel,guestOrigin,studioOrigin};
      },{guestOrigin,studioOrigin,content});
      try {
        await page.waitForFunction(()=>window.previewProof?.messages.some(x=>x.kind==="fetch"||x.kind==="fetch-error"),null,{timeout:15000});
      } catch(e) {
        console.log(name,"isolated timeout:",JSON.stringify({info,
          frames:page.frames().map(f=>f.url()),state:await page.evaluate(()=>window.previewProof),errors}));
        throw e;
      }
      const state=await page.evaluate(()=>window.previewProof);
      console.log(name,"isolated result:",JSON.stringify({info,state,errors}));
      assert.equal(state.messages.find(m=>m.kind==="isolation")?.value?.stolen,false,"Untrusted guest must not read studio DOM");
      assert.equal(state.messages.find(m=>m.kind==="fetch")?.value,"HTTP-RESPONSE-FROM-HOST","Guest fetch() should reach host");
      assert.ok(state.requests.some(x=>new URL(x.url).pathname==="/data.php"),"Guest SW must route fetch");
      await page.frameLocator("#preview").locator("#post").click();
      await page.waitForFunction(()=>window.previewProof?.messages.some(x=>x.kind==="post"),null,{timeout:12000});
      const afterSubmit=await page.evaluate(()=>window.previewProof);
      assert.equal(afterSubmit.messages.find(x=>x.kind==="post")?.value,"DONE","POST navigation should return host HTML");
      assert.equal(afterSubmit.requests.filter(x=>new URL(x.url).pathname==="/post.php"&&x.method==="POST").length,1,"POST must not replay");
      console.log(name,"isolated POST navigation:",JSON.stringify(afterSubmit.requests));
      await page.close();
    } finally { await browser.close(); }
  }
} finally {
  await Promise.all([studio,guest].map(s=>new Promise(ok=>s.close(ok))));
}
