/** Node server must never expose studio or admin endpoints on the guest hostname. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const randomPort = async () => {
  const server=createServer();
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
};
const call = (port, host, path, method = "GET") => new Promise((resolve, reject) => {
  const req = httpRequest({ hostname:"127.0.0.1", port, path, method, headers:{Host:host} }, response => {
    let chunks=[];
    response.on("data", part => chunks.push(part));
    response.on("end", () => resolve({ status: response.statusCode, headers:response.headers,
      body: Buffer.concat(chunks).toString("utf8") }));
  });
  req.on("error", reject); req.end();
});

test("untrusted preview hostname serves only broker assets; studio and admin stay hidden", { timeout: 25000 }, async () => {
  const base=await mkdtemp(join(tmpdir(),"alwis-preview-server-"));
  const site=join(base,"site"), data=join(base,"data"); await mkdir(join(site,"_pbl"),{recursive:true});
  const assets = {
    "index.html":"studio-only-not-for-guest",
    "guest-broker.html":"guest-public-broker",
    "guest-broker.mjs":"guest-public-js",
    "guest-sw.js":"guest-public-sw",
    "_pbl/client.js":"guest-local-bootstrap",
  };
  for(const [key,value] of Object.entries(assets)) await writeFile(join(site,key),value);
  await mkdir(data);
  const port=await randomPort();
  const studioHost="studio.localhost:"+port, previewHost="preview.localhost:"+port;
  const child=spawn(process.execPath,["--disable-warning=ExperimentalWarning","server/server.mjs"],{
    cwd:root, env:{ ...process.env,
      ALWIS_SITE_DIR:site,ALWIS_DATA_DIR:data,
      ALWIS_ADMIN_PASSWORD:"test-only-secret-do-not-use-live-2026",
      PUBLIC_BASE_URL:"http://"+studioHost, ALWIS_PREVIEW_ORIGIN:"http://"+previewHost,
      PORT:String(port),HOST:"127.0.0.1",TRUST_PROXY:"false",
    }, stdio:["ignore","pipe","pipe"],
  });
  let logs="";
  child.stdout.on("data",part=>logs+=part);child.stderr.on("data",part=>logs+=part);
  try {
    let ready=false;
    for(let attempt=0;attempt<60;attempt++){
      if(child.exitCode!==null) throw Error("Server exited: "+logs);
      try { if((await call(port,studioHost,"/readyz")).status===200){ready=true;break;} }
      catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(ready,"Server must start: "+logs);
    assert.equal((await call(port,studioHost,"/")).body,assets["index.html"]);
    assert.equal(JSON.parse((await call(port,studioHost,"/api/collab/config")).body).previewOrigin,"http://"+previewHost);
    for(const [path,body] of Object.entries(assets)){
      if(path==="index.html")continue;
      const result=await call(port,previewHost,"/"+path);
      assert.equal(result.status,200,path);
      assert.equal(result.body,body,path);
      assert.equal(result.headers["cross-origin-resource-policy"],"cross-origin");
    }
    const broker=(await call(port,previewHost,"/guest-broker.html"));
    assert.match(broker.headers["content-security-policy"],/frame-ancestors http:\/\/studio\.localhost/);
    for(const path of ["/", "/index.html", "/api/admin/config", "/api/collab/config", "/service-worker.js", "/release.json"]){
      const result=await call(port,previewHost,path);
      assert.equal(result.status,404,path);
      assert.doesNotMatch(result.body,/studio-only-not-for-guest/,path);
    }
    const unreachable=await call(port,previewHost,"/__alwis-guest/"+"a".repeat(32)+"/index.php");
    assert.equal(unreachable.status,503);
    assert.equal((await call(port,previewHost,"/guest-broker.html","POST")).status,405);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 1800))]);
    }
    if (logs) console.log("ALWIS preview origin test server logs", logs.slice(0, 1600));
    await rm(base,{recursive:true,force:true});
  }
});
