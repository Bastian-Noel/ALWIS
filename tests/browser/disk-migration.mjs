import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  chromium,
  firefox,
} from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const server = createStudioServer(),
  serve = server.listeners("request")[0];
server.removeListener("request", serve);
// Construct an actual pre-OPFS IDBFS checkpoint with the real native runtime.
const legacyWorker = (
  await readFile("packages/runtime/src/native-worker.mjs", "utf8")
).replace(
  "diskWorkspace=await DiskWorkspace.create(module,key,files,vfsQuota,projectMetadata());",
  "diskWorkspace=null;",
);
server.on("request", (req, res) => {
  if (req.url.includes("legacy-fixture=1")) {
    res.setHeader("Content-Type", "text/javascript");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.end(legacyWorker);
  } else serve(req, res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch({
      headless: true,
      ...(engine === chromium ? { args: ["--no-sandbox"] } : {}),
    });
    try {
      const page = await browser.newPage();
      await page.goto("http://127.0.0.1:" + server.address().port);
      const result = await page.evaluate(async () => {
        const { NativeRuntime } =
            await import("/packages/runtime/src/native-runtime.mjs"),
          key = "migration-" + crypto.randomUUID(),
          options = {
            projectKey: key,
            moduleURL: new URL("/engine/pbl-runtime.mjs", location.href).href,
          };
        const legacy = await NativeRuntime.create({
          ...options,
          workerURL: new URL(
            "/packages/runtime/src/native-worker.mjs?legacy-fixture=1",
            location.href,
          ),
        });
        await legacy.write(
          "/workspace/index.php",
          '<?php $p=new PDO("mysql:dbname=test","root","");echo $p->query("SELECT value FROM migration_proof")->fetchColumn();',
        );
        await legacy.write("/workspace/.sessions/sess_legacy", "count|i:7;");
        await legacy.sql(
          "CREATE TABLE migration_proof (value VARCHAR(32));",
          "test",
        );
        await legacy.sql(
          "INSERT INTO migration_proof VALUES ('preserved');",
          "test",
        );
        await legacy.shutdown({
          metadata: { format: 1, note: "old-checkpoint" },
        });
        const database = await new Promise((resolve, reject) => {
          const r = indexedDB.open("/.pbl/projects/@v2/" + key);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        const records = () =>
          new Promise((resolve, reject) => {
            const t = database.transaction("FILE_DATA"),
              r = t.objectStore("FILE_DATA").getAll();
            r.onsuccess = () =>
              resolve(
                r.result.map(
                  (x) => x.contents?.length ?? x.contents?.byteLength ?? 0,
                ),
              );
            r.onerror = () => reject(r.error);
          });
        const before = await records(),
          runtime = await NativeRuntime.create(options),
          after = await records();
        const output = await runtime.request({
            script: "/workspace/index.php",
          }),
          session = new TextDecoder().decode(
            await runtime.read("/workspace/.sessions/sess_legacy"),
          );
        const state = await runtime.state();
        await runtime.shutdown();
        const reopened = await NativeRuntime.create(options),
          second = await reopened.request({ script: "/workspace/index.php" });
        await reopened.shutdown({ save: false });
        database.close();
        return {
          before,
          after,
          body: new TextDecoder().decode(output.body),
          second: new TextDecoder().decode(second.body),
          session,
          state,
        };
      });
      assert.deepEqual(
        result.after,
        result.before,
        "Migration must leave old on-disk checkpoint untouched until save",
      );
      assert.equal(result.body, "preserved");
      assert.equal(result.second, "preserved");
      assert.equal(result.session, "count|i:7;");
      assert.equal(result.state.storageLayout, "opfs-files-atomic-sql");
      console.log(
        engine.name(),
        "legacy IDBFS → verified OPFS migration preserves PHP, sessions, SQL and original checkpoint.",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
