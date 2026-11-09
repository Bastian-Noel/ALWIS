import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

test("server image publication maintains a latest alias and versioned release notes", async () => {
  const workflow = await readFile(resolve(import.meta.dirname, "../.github/workflows/publish-server.yml"), "utf8");
  assert.match(workflow, /--tag "\$PACKAGE:latest"/);
  assert.match(workflow, /docker push "\$PACKAGE:latest"/);
  assert.match(workflow, /latest server edition with `docker pull %s:latest`/);
  assert.match(workflow, /awk '\/\^### Server container\$\/ \{exit\} \{print\}'/);
  assert.match(workflow, /latest-alias:/);
  assert.match(workflow, /docker tag "\$PACKAGE:\$VERSION" "\$PACKAGE:latest"/);
});

async function unusedPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("server edition protects settings, persists SQLite config and serves the static site safely", async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), "alwis-server-test-"));
  const site = resolve(directory, "site");
  const data = resolve(directory, "data");
  await mkdir(site);
  await writeFile(resolve(site, "index.html"), "<!doctype html><h1>ALWIS test</h1>");
  const port = await unusedPort();
  const address = `http://127.0.0.1:${port}`;
  const adminPassword = "a-long-random-test-admin-secret-0123456789";
  const auth = "Basic " + Buffer.from(`admin:${adminPassword}`).toString("base64");
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    ALWIS_SITE_DIR: site,
    ALWIS_DATA_DIR: data,
    ALWIS_ADMIN_PASSWORD: adminPassword,
    PUBLIC_BASE_URL: address,
    ALLOWED_ORIGINS: "",
    TRUST_PROXY: "false",
  };
  let child;
  const start = async () => {
    child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server/server.mjs"], {
      cwd: resolve(import.meta.dirname, ".."),
      env,
      stdio: "ignore",
    });
    child.on("error", () => {});
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw Error(`Server exited with ${child.exitCode}`);
      try {
        const response = await fetch(address + "/healthz");
        if (response.ok) return;
      } catch {}
      await delay(50);
    }
    throw Error("Server did not become healthy.");
  };
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), delay(3000)]);
  };
  t.after(async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
  });

  await start();
  const home = await fetch(address);
  assert.equal(await home.text(), "<!doctype html><h1>ALWIS test</h1>");
  assert.equal(home.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(home.headers.get("cross-origin-embedder-policy"), "require-corp");
  assert.equal((await fetch(address + "/../admin-password")).status, 404);

  const locked = await fetch(address + "/admin/server");
  assert.equal(locked.status, 401);
  assert.match(locked.headers.get("www-authenticate"), /Basic realm="ALWIS Server"/);
  const page = await fetch(address + "/admin/server", { headers: { Authorization: auth } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Administration du serveur/);

  const initial = await fetch(address + "/api/admin/config", { headers: { Authorization: auth } });
  assert.equal(initial.status, 200);
  const initialConfig = await initial.json();
  assert.equal(initialConfig.settings.publicBaseUrl, address);
  assert.equal(initialConfig.settings.collabHostGraceSeconds, 90);
  assert.equal((await fetch(address + "/api/admin/status")).status, 401);
  const initialStatus = await fetch(address + "/api/admin/status", { headers: { Authorization: auth } });
  assert.equal(initialStatus.status, 200);
  assert.equal((await initialStatus.json()).collaboration.rooms, 0);
  const saved = await fetch(address + "/api/admin/config", {
    method: "POST",
    headers: {
      Authorization: auth,
      Origin: address,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      publicBaseUrl: "https://studio.example.org/",
      allowedOrigins: ["https://editor.example.org"],
      maintenance: true,
      logLevel: "warn",
      collabRelayBurstKib: 1024,
      collabMaxConnections: 300,
      collabHostGraceSeconds: 120,
      collabMessagesPerSecond: 240,
    }),
  });
  assert.equal(saved.status, 200, await saved.text());

  const denied = await fetch(address, { headers: { Origin: "https://evil.example" } });
  assert.equal(denied.status, 403);
  assert.equal((await fetch(address)).status, 503);
  assert.equal((await fetch(address + "/admin/server", { headers: { Authorization: auth } })).status, 200);

  await stop();
  await start();
  const restored = await fetch(address + "/api/admin/config", { headers: { Authorization: auth } });
  const settings = (await restored.json()).settings;
  assert.equal(settings.publicBaseUrl, "https://studio.example.org");
  assert.deepEqual(settings.allowedOrigins, ["https://editor.example.org"]);
  assert.equal(settings.maintenance, true);
  assert.equal(settings.logLevel, "warn");
  assert.equal(settings.collabRelayBurstKib, 1024);
  assert.equal(settings.collabMaxConnections, 300);
  assert.equal(settings.collabHostGraceSeconds, 120);
  assert.equal(settings.collabMessagesPerSecond, 240);
  assert.equal((await fetch(address + "/api/admin/status", { headers: { Authorization: auth } })).status, 200);
  const resumePublic = await fetch(address + "/api/admin/config", {
    method: "POST",
    headers: { Authorization: auth, Origin: address, "Content-Type": "application/json" },
    body: JSON.stringify({ maintenance: false }),
  });
  assert.equal(resumePublic.status, 200);
  const liveCollabConfig = await (await fetch(address + "/api/collab/config")).json();
  assert.equal(liveCollabConfig.hostGraceMs, 120_000);
  assert.equal(liveCollabConfig.relayBurstBytes, 1024 * 1024);
  assert.equal(liveCollabConfig.maxConnections, 300);
  assert.equal(liveCollabConfig.messagesPerSec, 240);
  const invalid = await fetch(address + "/api/admin/config", {
    method: "POST",
    headers: {
      Authorization: auth,
      Origin: address,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ publicBaseUrl: "http://studio.example.org" }),
  });
  assert.equal(invalid.status, 400);
});
