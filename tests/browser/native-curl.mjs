/** Independent PHP WASM/browser Fetch cURL test; never a claim of full libcurl. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const dist = resolve(process.env.ALWIS_PARITY_RUNTIME_DIST ||
  join(root, "build-work/bridge/.native-build/engine/wasm/runtime-dist"));
const playwright = await import(pathToFileURL(join(root, "build-work/php/node_modules/playwright/index.mjs")).href);
const fixture = await readFile(join(root, "fixtures/compatibility/native-curl.php"), "utf8");
const cases = [];
const server = createServer(async (req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  const target = new URL(req.url, "http://localhost");
  if (target.pathname === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><title>ALWIS curl test</title>");
    return;
  }
  if (target.pathname === "/echo") {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ method: req.method, hex: Buffer.concat(chunks).toString("hex"),
      marker: req.headers["x-alwis-curl"] || null }));
    return;
  }
  if (target.pathname === "/redirect") {
    res.writeHead(302, { Location: "/done" });
    res.end(); return;
  }
  if (target.pathname === "/done") { res.end("redirect-done"); return; }
  if (target.pathname === "/slow") {
    const timer = setTimeout(() => res.end("late"), 500);
    res.on("close", () => clearTimeout(timer));
    return;
  }
  if (target.pathname === "/bad") { res.writeHead(418); res.end("bad-418"); return; }
  try {
    const base = target.pathname.startsWith("/engine/") ? dist : root;
    const relative = target.pathname.startsWith("/engine/") ?
      target.pathname.slice(8) : target.pathname.slice(1);
    const file = resolve(base, relative);
    if (!file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
    res.setHeader("Content-Type", extname(file) === ".wasm" ? "application/wasm" : "text/javascript");
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
try {
  const origin = "http://127.0.0.1:" + server.address().port;
  for (const name of (process.argv[2] || "chromium,firefox").split(",")) {
    const browser = await playwright[name].launch({ headless: true,
      ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}) });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(60000);
      await page.goto(origin + "/");
      const result = await page.evaluate(async ({ origin, fixture }) => {
        const { NativeRuntime } = await import("/packages/runtime/src/native-runtime.mjs");
        const runtime = await NativeRuntime.create({ moduleURL: origin + "/engine/pbl-runtime.mjs" });
        const decoder = new TextDecoder();
        await runtime.write("/workspace/curl.php", fixture);
        await runtime.write("/workspace/hello.txt", "LOCAL-STATIC");
        const request = async id => {
          const url = origin + "/curl.php?case=" + id + "&target=" + encodeURIComponent(origin);
          const response = await runtime.request({ script: "/workspace/curl.php", url });
          if (response.exitCode !== 0)
            throw Error("PHP curl failed in " + id + ": " + decoder.decode(response.stderr));
          const output = decoder.decode(response.body);
          try { return JSON.parse(output); }
          catch { throw Error("Invalid curl JSON in " + id + ": " + output); }
        };
        try {
          const post = await request("echo");
          if (!post.ok || !post.handle || post.code !== 200)
            throw Error("curl POST: " + JSON.stringify(post));
          const echoed = JSON.parse(post.value);
          if (echoed.method !== "POST" || echoed.hex !== "007f80ff" || echoed.marker !== "proof")
            throw Error("Binary POST mismatched: " + post.value);
          const redir = await request("redirect");
          if (!redir.ok || redir.code !== 200 || redir.value !== "redirect-done")
            throw Error("Redirect: " + JSON.stringify(redir));
          const bad = await request("bad");
          if (bad.ok || bad.code !== 418 || bad.errno !== 22)
            throw Error("HTTP error: " + JSON.stringify(bad));
          const timeout = await request("timeout");
          if (timeout.ok || timeout.errno !== 28)
            throw Error("Timeout: " + JSON.stringify(timeout));
          const local = await request("self-static");
          if (!local.ok || local.value !== "LOCAL-STATIC")
            throw Error("Own-site static: " + JSON.stringify(local));
          const recursive = await request("self-php");
          if (recursive.ok || !recursive.error.includes("Recursive PHP"))
            throw Error("Unsafe PHP recursion: " + JSON.stringify(recursive));
          const inFlight = request("cancel");
          await new Promise(ok => setTimeout(ok, 60));
          const canceled = await runtime.abortHttp();
          const failed = await inFlight;
          if (!canceled || failed.ok || !failed.error.includes("canceled"))
            throw Error("Cancellation: " + JSON.stringify({ canceled, failed }));
          return { passed: true, tests: 7 };
        } finally { runtime.close(); }
      }, { origin, fixture });
      assert.equal(result.passed, true);
      console.log(name, "Independent WASM browser Fetch/cURL:", result.tests, "passed");
      cases.push({ browser: name, ...result });
    } finally { await browser.close(); }
  }
  const output = resolve(root, "build-work/curl-validation");
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "browser.json"), JSON.stringify(cases, null, 2) + "\n");
} finally {
  server.closeAllConnections();
  await new Promise(resolveClose => server.close(resolveClose));
}
