/** Real browser proof of consent, SW scope, follow-only schema and static scrolling. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const pw = await import(pathToFileURL(process.env.ALWIS_PLAYWRIGHT_MODULE || resolve(root, "build-work/php/node_modules/playwright/index.mjs")).href);
const server = createServer(async (req, res) => {
  const p = new URL(req.url, "http://localhost").pathname;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  if (p === "/") { res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><title>Studio</title><main id="main"></main><div id="tree"></div><div id="pvFrames"></div>'); return; }
  if (p === "/guest-broker.html" || /^\/__alwis-guest\/[a-f0-9]{32}\/__broker\.html$/.test(p)) {
    res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><script type="module" src="/guest-broker.mjs"></script>'); return;
  }
  if (p === "/studio-sw.js") {
    res.setHeader("Content-Type", "text/javascript"); res.end('self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));'); return;
  }
  const files = { "/guest-sw.js": "apps/studio/collab/isolated-preview-sw.mjs",
    "/guest-broker.mjs": "apps/studio/collab/isolated-preview-broker.mjs", "/_pbl/client.js": "apps/studio/client-bootstrap.js" };
  const file = files[p] || (p.startsWith("/apps/studio/collab/") && p.endsWith(".mjs") && !p.includes("..") ? p.slice(1) : null);
  if (file) { res.setHeader("Content-Type", "text/javascript"); res.end(await readFile(resolve(root, file))); return; }
  res.writeHead(404).end("No PHP on test HTTP server");
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const previewServer = createServer(server.listeners("request")[0]);
await new Promise(resolve => previewServer.listen(0, "127.0.0.1", resolve));
const previewOrigin = "http://127.0.0.1:" + previewServer.address().port;
try {
  for (const name of (process.argv[2] || "chromium,firefox").split(",")) {
    const browser = await pw[name].launch({ headless: true, ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}) });
    try {
      const page = await browser.newPage();
      const errors = []; page.on("pageerror", e => errors.push(e.message));
      page.on("console", message => { if (message.type() === "error") console.log(name + " console: " + message.text()); });
      await page.goto(origin);
      const scope = await page.evaluate(async () => {
        await navigator.serviceWorker.register("/studio-sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
        const { IsolatedGuestPreviewController } = await import("/apps/studio/collab/isolated-preview-controller.mjs");
        const channel = "a".repeat(32), requests = [];
        const refused = new IsolatedGuestPreviewController({ origin: location.origin, channel, allowSameOrigin: true, confirmTrust: () => false });
        let rejected = false;
        try { await refused.start(); } catch { rejected = true; }
        const before = document.querySelectorAll("iframe").length;
        const bridge = new IsolatedGuestPreviewController({ origin: location.origin, channel,
          allowSameOrigin: true, confirmTrust: () => true, request: async request => {
            requests.push({ url: request.url, method: request.method });
            const path = new URL(request.url).pathname;
            const html = '<!doctype html><head><title>Guest</title></head><body style="height:2400px"><button id="send">Hello</button><script>fetch("/data.php").then(r=>r.text()).then(t=>document.body.dataset.result=t)</script></body>';
            return { status: 200, headers: [["Content-Type", path === "/index.php" ? "text/html" : "text/plain"]], body: new TextEncoder().encode(path === "/index.php" ? html : "HOST-HTTP-OK") };
          }, cookie: async () => [] });
        await bridge.start(); window.bridge = bridge; window.requests = requests;
        const frame = document.createElement("iframe"); frame.id = "guest";
        frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
        frame.src = bridge.url("/index.php"); document.querySelector("#pvFrames").append(frame);
        return { rejected, before, controller: navigator.serviceWorker.controller.scriptURL,
          scopes: (await navigator.serviceWorker.getRegistrations()).map(r => r.scope) };
      });
      assert.equal(scope.rejected, true); assert.equal(scope.before, 0);
      assert.equal(scope.controller, origin + "/studio-sw.js");
      assert.deepEqual(scope.scopes.sort(), [origin + "/", origin + "/__alwis-guest/" + "a".repeat(32) + "/"].sort());
      await page.waitForFunction(() => document.querySelector("#guest")?.contentDocument?.body?.dataset.result === "HOST-HTTP-OK", null, { timeout: 15000 });
      assert.ok(await page.evaluate(() => requests.some(r => new URL(r.url).pathname === "/data.php")));
      await page.evaluate(() => { bridge.stop(); document.querySelector("#guest").remove(); });
      await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 1);
      const geometry = await page.evaluate(async () => {
        const { FocusLayer } = await import("/apps/studio/collab/focus.mjs");
        document.querySelector("#main").innerHTML = '<div id="canvas"><svg id="sv" width="800" height="400"><g id="layer" transform="translate(100 50) scale(2)"></g></svg></div>';
        const c = { view: "schema", pan: [100, 50], zoom: 2, cw: 800, ch: 400 }, sent = [];
        let following = false, applied = 0;
        const focus = new FocusLayer({ send: m => sent.push(m), peer: () => ({ name: "Peer", state: "online" }), getCtx: () => c,
          isFollowing: () => following, onViewport: () => applied++ });
        focus.start();
        focus.receive("g", { k: "viewport", cx: 10, cy: 20, zoom: 0.5 });
        const independent = applied === 0;
        following = true; focus.receive("g", { k: "viewport", cx: 10, cy: 20, zoom: 0.5 });
        const follows = applied === 1;
        focus.receive("g", { k: "mouse", s: "sv", space: "world", x: 20, y: 30 });
        focus.receive("g", { k: "rubber", rubber: { d: "M20 30 L50 60", pan: [900, 700], zoom: 0.5 } });
        focus.render();
        const rect = document.querySelector("#sv").getBoundingClientRect(), mouse = document.querySelector(".cb-mouse");
        const correctPointer = parseFloat(mouse.style.left) === rect.left + 140 && parseFloat(mouse.style.top) === rect.top + 110;
        const rubber = document.querySelector(".cb-rubber");
        const correctRubber = rubber.parentNode.id === "layer" && !rubber.hasAttribute("transform") && rubber.getAttribute("d") === "M20 30 L50 60";
        document.querySelector("#sv").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: rect.left + 140, clientY: rect.top + 110 }));
        await new Promise(resolve => setTimeout(resolve, 100));
        const pointer = sent.find(m => m.k === "mouse");
        focus.stop();
        return { independent, follows, correctPointer, correctRubber, pointer };
      });
      for (const key of ["independent", "follows", "correctPointer", "correctRubber"]) assert.equal(geometry[key], true, key);
      assert.equal(geometry.pointer.space, "world"); assert.equal(geometry.pointer.x, 20); assert.equal(geometry.pointer.y, 30);
      const scrolling = await page.evaluate(async () => {
        const { snapshot, createMirror, watchPreview } = await import("/apps/studio/collab/preview.mjs");
        const source = document.createElement("iframe"); document.body.append(source);
        await new Promise(resolve => { source.onload = resolve; source.srcdoc = '<!doctype html><html><head></head><body style="height:3000px"><div id="nested" style="height:50px;overflow:auto"><div style="height:600px">Nested</div></div></body></html>'; });
        source.contentWindow.scrollTo(0, 250); source.contentDocument.querySelector("#nested").scrollTop = 75;
        const html = snapshot(source), frame = document.createElement("iframe");
        document.querySelector("#pvFrames").append(frame);
        const mirror = createMirror({ container: () => document.querySelector("#pvFrames") });
        const loaded = new Promise(resolve => frame.onload = resolve);
        mirror.receive({ id: "snapshot", part: 0, parts: 1, d: html, scroll: { x: 0, y: 250, elements: [{ i: 3, x: 0, y: 75 }] } });
        await loaded;
        await new Promise(resolve => requestAnimationFrame(resolve));
        const initial = frame.contentWindow.scrollY;
        mirror.scroll({ x: 0, y: 600, elements: [{ i: 3, x: 0, y: 90 }] });
        let sharedScroll;
        const observed = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(Error("already-loaded host preview scroll was not broadcast")), 3000);
          sharedScroll = watchPreview({ container: () => ({ querySelector: () => source }), send: message => {
            if (message.t === "pv-scroll" && message.scroll.y === 450) { clearTimeout(timeout); resolve(); }
          } });
          source.contentWindow.scrollTo(0, 450);
        });
        await observed; sharedScroll.stop();
        const result = { initial, current: frame.contentWindow.scrollY, nested: frame.contentDocument.querySelector("#nested").scrollTop };
        source.remove(); frame.remove(); return result;
      });
      assert.equal(scrolling.initial, 250); assert.equal(scrolling.current, 600); assert.equal(scrolling.nested, 90);
      await page.evaluate(async previewOrigin => {
        const { IsolatedGuestPreviewController } = await import("/apps/studio/collab/isolated-preview-controller.mjs");
        const { FocusLayer } = await import("/apps/studio/collab/focus.mjs");
        window.presenceSent = [];
        const focus = new FocusLayer({ send: m => presenceSent.push(m), peer: () => ({ name: "Peer", state: "online" }),
          getCtx: () => ({ view: "code" }), isFollowing: id => id === "g" });
        focus.start(); window.presenceFocus = focus;
        const bridge = new IsolatedGuestPreviewController({ origin: previewOrigin, channel: "b".repeat(32),
          request: async () => ({ status: 200, headers: [["Content-Type", "text/html"]], body: new TextEncoder().encode('<!doctype html><body style="height:2500px"><button id="target">Pointer target</button>') }), cookie: async () => [] });
        await bridge.start(); window.crossBridge = bridge;
        const frame = document.createElement("iframe"); frame.id = "cross-preview";
        frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
        frame.src = bridge.url("/index.php"); document.querySelector("#pvFrames").append(frame);
      }, previewOrigin);
      await page.frameLocator("#cross-preview").locator("#target").hover();
      await page.waitForFunction(() => presenceSent.some(m => m.k === "mouse" && m.s === "pv" && m.space === "document"));
      await page.evaluate(() => presenceFocus.receive("g", { k: "preview-scroll", frame: 0, x: 0, y: 500 }));
      await page.waitForFunction(() => document.querySelector("#cross-preview").__cbScroll?.y === 500);
      await page.evaluate(() => { presenceFocus.stop(); crossBridge.stop(); document.querySelector("#cross-preview").remove(); });
      assert.deepEqual(errors, []);
      console.log(name + ": consent refused/accepted, narrow SW, host HTTP, follow-only schema, world pointers, links and static scroll and cross-origin pointer/scroll passed");
    } finally { await browser.close(); }
  }
} finally { await Promise.all([server, previewServer].map(server => new Promise(resolve => server.close(resolve)))); }
