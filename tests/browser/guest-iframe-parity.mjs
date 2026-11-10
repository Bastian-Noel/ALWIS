/**
 * Real-browser guest preview isolation probe: exercises the actual Service
 * Worker, iframe sandbox, bootstrap and fetch in Chromium and Firefox.
 * No third-party site, no PHP execution or remote collaboration required.
 * The HTTP "host" response is mocked; real multi-peer parity is separate.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const pw = await import(pathToFileURL(resolve(repo, "build-work/php/node_modules/playwright/index.mjs")).href);
const mocks = new Map([
  ["/", Buffer.from("<!doctype html><html><head><title>ALWIS guest preview browser test</title></head><body><h1>ALWIS guest preview</h1></body></html>")],
]);
const routeMap = new Map([
  ["/service-worker.js", "apps/studio/service-worker.mjs"],
  ["/apps/studio/collab/guest-preview-route.mjs", "apps/studio/collab/guest-preview-route.mjs"],
  ["/apps/studio/collab/guest-preview-controller.mjs", "apps/studio/collab/guest-preview-controller.mjs"],
  ["/_pbl/client.js", "apps/studio/client-bootstrap.js"],
]);
const source = createServer(async (request, response) => {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cache-Control", "no-store");
  const pathname = new URL(request.url, "http://localhost").pathname;
  const mapped = routeMap.get(pathname);
  if (mocks.has(pathname)) {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(mocks.get(pathname));
  } else if (mapped) {
    const path = resolve(repo, mapped);
    assert.ok(path.startsWith(repo + sep));
    response.setHeader("Content-Type", "text/javascript; charset=utf-8");
    if (pathname === "/service-worker.js") response.setHeader("Service-Worker-Allowed", "/");
    response.end(await readFile(path));
  } else {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Missing resource " + pathname);
  }
});
await new Promise(resolve => source.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + source.address().port;
const html = `<!doctype html><html><head><title>ALWIS guest isolated PHP preview</title></head>
<body><h1>Guest HTML</h1>
<script>
(function () {
  const notify = (kind, value) => parent.postMessage({ source: "alwis-iframe-probe", kind, value }, "*");
  notify("boot", { origin: location.origin, href: location.href, secure: isSecureContext });
  try { notify("storage", { value: localStorage.getItem("guest-probe") }); }
  catch (error) { notify("storage-error", error.name + ": " + error.message); }
  Promise.resolve().then(async () => {
    try {
      const response = await fetch("/data.php");
      notify("fetch", { status: response.status, text: await response.text() });
    } catch (error) { notify("fetch-error", error.name + ": " + error.message); }
  });
})();
</script></body></html>`;

try {
  for (const name of (process.argv[2] ?? "chromium,firefox").split(",")) {
    const browser = await pw[name].launch({
      headless: true,
      ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}),
    });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => {
        if (message.type() === "error") errors.push("console: " + message.text());
      });
      await page.goto(origin + "/");
      const setup = await page.evaluate(async ({ html }) => {
        window.__guestProbe = { messages: [], requests: [] };
        window.addEventListener("message", event => {
          if (event.data?.source === "alwis-iframe-probe")
            window.__guestProbe.messages.push(event.data);
        });
        await navigator.serviceWorker.register("/service-worker.js", { type: "module", scope: "/" });
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error("Service Worker did not control studio")), 12000);
            navigator.serviceWorker.addEventListener("controllerchange", () => { clearTimeout(timer); resolve(); }, { once: true });
          });
        const { GuestPreviewController } = await import("/apps/studio/collab/guest-preview-controller.mjs");
        const encoder = new TextEncoder();
        const bridge = new GuestPreviewController({
          request: async request => {
            const pathname = new URL(request.url).pathname;
            window.__guestProbe.requests.push({ method: request.method, pathname });
            if (pathname === "/index.php")
              return { status: 200, headers: [["Content-Type", "text/html; charset=utf-8"]], body: encoder.encode(html), cookies: [] };
            if (pathname === "/data.php")
              return { status: 200, headers: [["Content-Type", "text/plain; charset=utf-8"]], body: encoder.encode("DATA-FROM-HOST"), cookies: [] };
            return { status: 404, headers: [["Content-Type", "text/plain"]], body: encoder.encode("NOT FOUND"), cookies: [] };
          },
          cookie: async () => [],
        });
        await bridge.start();
        window.__guestBridge = bridge;
        const frame = document.createElement("iframe");
        frame.setAttribute("sandbox", "allow-scripts allow-forms");
        frame.id = "isolatedGuestFrame";
        frame.src = bridge.url("/index.php");
        document.body.append(frame);
        return { channel: bridge.channel, src: frame.src };
      }, { html });
      await page.waitForFunction(() => window.__guestProbe?.messages?.some(m => m.kind === "fetch" || m.kind === "fetch-error"), null, { timeout: 15000 });
      const details = await page.evaluate(() => window.__guestProbe);
      console.log(name, "isolated iframe:", JSON.stringify({ setup, details, errors }));
      assert.ok(details.messages.some(m => m.kind === "boot"), "Guest HTML script must execute");
      const fetch = details.messages.find(m => m.kind === "fetch");
      assert.ok(fetch, "Guest fetch() must work: " + JSON.stringify({ details, errors }));
      assert.equal(fetch.value.status, 200);
      assert.equal(fetch.value.text, "DATA-FROM-HOST");
      assert.ok(details.requests.some(r => r.pathname === "/data.php"), "Guest network request must reach host");
      await page.evaluate(() => window.__guestBridge?.stop());
      await context.close();
    } finally { await browser.close(); }
  }
} finally {
  source.closeAllConnections();
  await new Promise(resolve => source.close(resolve));
}
