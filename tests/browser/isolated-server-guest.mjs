/**
 * Actual ALWIS server + browser preview bridge on two origins.
 * PHP responses are simulated: this validates server routing, CSP, cookies,
 * Service Worker, client bootstrap, fetch and POST, NOT native PHP runtime.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as nodeServer, request as nodeRequest } from "node:http";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const playwright = await import(pathToFileURL(
  process.env.ALWIS_PLAYWRIGHT_MODULE || join(root, "build-work/php/node_modules/playwright/index.mjs")).href);
const siteRoot = await mkdtemp(join(tmpdir(), "alwis-real-server-guest-"));
const site = join(siteRoot, "site");
const data = join(siteRoot, "data");
await mkdir(join(site, "_pbl"), { recursive: true });
await mkdir(data);
await Promise.all([
  ["isolated-preview-sw.mjs", "guest-sw.js"],
  ["isolated-preview-broker.mjs", "guest-broker.mjs"],
  ["isolated-preview-controller.mjs", "isolated-preview-controller.mjs"],
  ["preview-security.mjs", "preview-security.mjs"],
  ["guest-preview-route.mjs", "guest-preview-route.mjs"],
].map(([source, dest]) =>
  copyFile(join(root, "apps/studio/collab", source), join(site, dest))));
await copyFile(join(root, "apps/studio/client-bootstrap.js"), join(site, "_pbl/client.js"));
await writeFile(join(site, "index.html"),
  "<!doctype html><html><head><meta charset='utf-8'><title>ALWIS trusted studio mock page</title></head><body><h1>Trusted studio origin</h1></body></html>");
await writeFile(join(site, "guest-broker.html"),
  '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/guest-broker.mjs"></script></body></html>');

const probe = nodeServer();
await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
// Two loopback ports model a real reverse proxy with two virtual hosts.
 // The proxy keeps the preview request Host, so the real ALWIS server still
 // selects its preview-only route and never exposes the admin/studio endpoints.
const previewProxy = nodeServer((request, response) => {
  const upstream = nodeRequest({
    hostname: "127.0.0.1", port, method: request.method, path: request.url,
    headers: { ...request.headers },
  }, remote => {
    response.writeHead(remote.statusCode, remote.headers);
    remote.pipe(response);
  });
  upstream.on("error", error => {
    response.writeHead(502).end("Preview proxy unavailable: " + error.message);
  });
  request.pipe(upstream);
});
await new Promise(resolve => previewProxy.listen(0, "127.0.0.1", resolve));
const previewPort = previewProxy.address().port;
const studioOrigin = "http://127.0.0.1:" + port;
const previewOrigin = "http://127.0.0.1:" + previewPort;
let logs = "";
const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server/server.mjs"], {
  cwd: root,
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port),
    ALWIS_ADMIN_PASSWORD: "temporary-browser-test-password-not-for-production",
    ALWIS_SITE_DIR: site, ALWIS_DATA_DIR: data,
    PUBLIC_BASE_URL: studioOrigin, ALWIS_PREVIEW_ORIGIN: previewOrigin, ALWIS_GUEST_PREVIEW_STATIC: "false", TRUST_PROXY: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", part => logs += part.toString());
server.stderr.on("data", part => logs += part.toString());

const html = '<!doctype html><html><head><title>Sample PHP owner response</title></head><body>'
  +'<script>'
  +'const msg=(type,value)=>parent.postMessage({type,value,kind:"alwis-guest-proof"},"*");'
  +'let canReadParent=false;try{void parent.document.body.innerHTML;canReadParent=true;}catch(e){}'
  +'document.cookie="theme=dark; Path=/";'
  +'msg("isolated",{canReadParent,origin:location.origin});'
  +'fetch("/data.php").then(r=>r.text()).then(v=>msg("fetch",v)).catch(e=>msg("error",e.message));'
  +'fetch("/upload.php",{method:"POST",headers:{"Content-Type":"application/octet-stream"},'
  +'body:new Uint8Array([0,127,128,255])}).then(r=>r.text()).then(v=>msg("binary",v))'
  +'.catch(e=>msg("binary-error",e.message));'
  +'fetch("/redirect.php").then(r=>r.text()).then(v=>msg("redirect",v))'
  +'.catch(e=>msg("redirect-error",e.message));'
  +'</script><form action="/post.php" method="post"><input name="x" value="42">'
  +'<button id="submit" type="submit">Send POST</button></form></body></html>';
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw Error("Server unexpectedly exited: " + logs);
    try {
      const res = await fetch(studioOrigin + "/readyz");
      if (res.ok) { ready = true; break; }
    } catch { /* server not yet listening */ }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  assert.ok(ready, "ALWIS server failed to start: " + logs);
  for (const name of (process.argv[2] ?? "chromium,firefox").split(",")) {
    const browser = await playwright[name].launch({ headless: true,
      ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}) });
    try {
      const page = await browser.newPage();
      const errors = [], responses = [], navigations = [];
      page.on("pageerror", error => errors.push("pageerror " + error.message));
      page.on("console", message => {
        if (message.type() === "error") errors.push("console " + message.text());
      });
      page.on("requestfailed", request => errors.push(
        "request-failed " + request.url() + " " + request.failure()?.errorText));
      page.on("response", response => {
        if (response.url().includes("__alwis-guest") || response.url().includes("guest-"))
          responses.push({url: response.url(), status: response.status(), headers: response.headers()});
      });
      page.on("framenavigated", frame => navigations.push(frame.url()));
      await page.goto(studioOrigin + "/");
      await page.evaluate(async ({ previewOrigin, studioOrigin, html }) => {
        const { IsolatedGuestPreviewController } = await import("/isolated-preview-controller.mjs");
        window.__guestE2E = { messages: [], requests: [], cookies: [], errors: [] };
        window.addEventListener("message", event => {
          if (event.origin === previewOrigin && event.data?.kind === "alwis-guest-proof")
            window.__guestE2E.messages.push(event.data);
        });
        const enc = new TextEncoder(), state = window.__guestE2E;
        const bridge = new IsolatedGuestPreviewController({
          origin: previewOrigin, studioOrigin,
          request: async req => {
            const u = new URL(req.url);
            const bodyBytes = [...(req.body ?? [])];
            state.requests.push({ url: u.href, method: req.method, cookies: [...state.cookies],
              ...(req.method === "POST" ? { bytes: bodyBytes } : {}) });
            let status = 200, contentType = "text/html; charset=utf-8", text;
            const extraHeaders = [];
            switch (u.pathname) {
              case "/index.php": text = html; break;
              case "/data.php":
                text = "GET-REACHED-OWNER:" + state.cookies.map(c => c.name + "=" + c.value).join(";");
                contentType = "text/plain; charset=utf-8"; break;
              case "/post.php":
                text = '<html><head></head><body><script>parent.postMessage({kind:"alwis-guest-proof",type:"post",value:"POST-OK"},"*")</script></body></html>';
                break;
              case "/upload.php":
                text = "BINARY-OK:" + bodyBytes.join(",");
                contentType = "text/plain; charset=utf-8"; break;
              case "/redirect.php":
                status = 302; text = "";
                extraHeaders.push(["Location", "/final.php"]); break;
              case "/final.php":
                text = "REDIRECT-OK";
                contentType = "text/plain; charset=utf-8"; break;
              default: status = 404; contentType = "text/plain"; text = "Not found";
            }
            return { status, headers: [["Content-Type", contentType], ...extraHeaders],
              body: enc.encode(text), cookies: [...state.cookies] };
          },
          cookie: async (line, url) => {
            state.cookies = [{ name: "theme", value: "dark", path: "/", expires: null, secure: false }];
            return [...state.cookies];
          },
        });
        await bridge.start();
        window.__guestBridge = bridge;
        const iframe = document.createElement("iframe");
        iframe.id = "untrusted-project";
        iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
        iframe.src = bridge.url("/index.php");
        document.body.append(iframe);
      }, { previewOrigin, studioOrigin, html });
      try {
        await page.waitForFunction(() => window.__guestE2E.messages.some(m => m.type === "fetch" || m.type === "error"),
          null, { timeout: 20000 });
      } catch (error) {
        console.log(name, "e2e debug:", JSON.stringify({
          frames: page.frames().map(f => f.url()), state: await page.evaluate(() => window.__guestE2E),
          errors, responses, navigations, server: logs.slice(-1000) }));
        throw error;
      }
      await page.waitForFunction(() => {
        const messages = window.__guestE2E?.messages ?? [];
        return ["binary","redirect","binary-error","redirect-error"].filter(type =>
          messages.some(message => message.type === type)).length >= 2;
      }, null, { timeout: 15000 });
      const before = await page.evaluate(() => window.__guestE2E);
      assert.equal(before.messages.find(m => m.type === "binary")?.value, "BINARY-OK:0,127,128,255");
      assert.equal(before.messages.find(m => m.type === "redirect")?.value, "REDIRECT-OK");
      const upload = before.requests.filter(r => new URL(r.url).pathname === "/upload.php");
      assert.equal(upload.length, 1, "Binary POST must not replay or cross channels");
      assert.deepEqual(upload[0].bytes, [0,127,128,255], "Exact binary body must reach trusted owner");
      assert.equal(before.requests.filter(r => new URL(r.url).pathname === "/final.php").length, 1,
        "Redirect must stay on the isolated preview channel");
      assert.equal(before.messages.find(m => m.type === "isolated")?.value?.canReadParent, false);
      assert.equal(before.messages.find(m => m.type === "fetch")?.value, "GET-REACHED-OWNER:theme=dark");
      assert.ok(before.requests.every(r => r.url.startsWith(studioOrigin)), "Only the owner sees the normalized request URL");
      assert.ok(before.requests.some(r => new URL(r.url).pathname === "/data.php"));
      console.log(name, "pre-POST frames:", JSON.stringify(await Promise.all(
        page.frames().map(async frame => ({
          url: frame.url(),
          body: (await frame.locator("body").innerHTML().catch(e => "frame not readable: " + e.message)).slice(0, 650),
        })))));
      await page.frameLocator("#untrusted-project").locator("#submit").click({ timeout: 6500 });
      await page.waitForFunction(() => window.__guestE2E.messages.some(m => m.type === "post"),
        null, { timeout: 20000 });
      const after = await page.evaluate(() => window.__guestE2E);
      assert.equal(after.messages.find(m => m.type === "post")?.value, "POST-OK");
      assert.equal(after.requests.filter(r => r.method === "POST"
        && new URL(r.url).pathname === "/post.php").length, 1);
      assert.equal(after.cookies[0]?.value, "dark");
      await page.evaluate(() => window.__guestBridge.stop());
      await page.close();
      console.log(name, "REAL ALWIS SERVER ORIGIN E2E: PASS", JSON.stringify({
        requests: after.requests.map(r => ({ url: r.url, method: r.method })), errors }));
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise(resolve => server.once("exit", resolve)),
      new Promise(resolve => setTimeout(resolve, 2500)),
    ]);
  }
  await new Promise(resolve => previewProxy.close(resolve));
  await rm(siteRoot, { recursive: true, force: true });
}
