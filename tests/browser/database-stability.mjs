import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const root = resolve(new URL("../..", import.meta.url).pathname),
  pw = await import(
    pathToFileURL(
      resolve(root, "build-work/php/node_modules/playwright/index.mjs"),
    ).href
  ),
  fixture = await readFile(
    resolve(root, "fixtures/compatibility/database-stability.php"),
    "utf8",
  ),
  server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  for (const name of (process.argv[2] ?? "chromium,firefox").split(",")) {
    const browser = await pw[name].launch({
      headless: true,
      ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}),
    });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const result = await page.evaluate(async (code) => {
        const { NativeRuntime } = await import(
          "/packages/runtime/src/native-runtime.mjs"
        );
        const rt = await NativeRuntime.create({
          moduleURL: new URL("/engine/pbl-runtime.mjs", location.href).href,
        });
        try {
          await rt.write("/workspace/stability.php", code);
          const samples = [];
          for (let i = 0; i < 12; i++) {
            const response = await rt.request({
                script: "/workspace/stability.php",
              }),
              stderr = new TextDecoder().decode(response.stderr),
              body = new TextDecoder().decode(response.body);
            if (response.exitCode !== 0 || stderr)
              throw Error(stderr + " " + body);
            const data = JSON.parse(body);
            if (!data.ok) throw Error(body);
            const state = await rt.state();
            if (
              state.sqlConnections ||
              state.nativeStatements ||
              state.preparedSQLReservedBytes
            )
              throw Error("Native owners leaked after request");
            samples.push({
              iteration: i,
              allocatorUsedBytes: state.allocatorUsedBytes,
              linearMemoryBytes: state.linearMemoryBytes,
              checks: data.checks,
            });
          }
          return { passed: true, samples };
        } finally {
          rt.close();
        }
      }, fixture);
      assert.equal(result.samples.length, 12);
      await mkdir(resolve(root, "engine/fusion/receipts/database-stability"), {
        recursive: true,
      });
      const wasmSha256 = createHash("sha256")
        .update(
          await readFile(
            resolve(
              root,
              "build-work/bridge/.native-build/engine/wasm/runtime-dist/pbl-runtime.wasm",
            ),
          ),
        )
        .digest("hex");
      await writeFile(
        resolve(root, `engine/fusion/receipts/database-stability/${name}.json`),
        JSON.stringify(
          {
            browser: name,
            version: browser.version(),
            wasmSha256,
            scope:
              "12 mixed PHP requests, not a long endurance or browser RAM measurement",
            ...result,
          },
          null,
          2,
        ),
      );
      console.log(name, "database stability passed");
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
