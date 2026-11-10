/**
 * Regression: a fatal PHP exception/parse error, PDO exception or explicit
 * nonzero exit must never poison the next request in the SAME PHP/MariaDB WASM.
 * A fresh NativeRuntime per case would hide the very bug being tested.
 */
import assert from "node:assert/strict";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import {resolve, join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createStudioServer} from "../../scripts/serve-studio.mjs";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const dist = resolve(process.env.ALWIS_PARITY_RUNTIME_DIST ||
  join(root, "build-work/bridge/.native-build/engine/wasm/runtime-dist"));
const pw = await import(pathToFileURL(join(root, "build-work/php/node_modules/playwright/index.mjs")).href);
const source = await readFile(join(root, "fixtures/compatibility/native-error-recovery.php"), "utf8");
const cases = [
  "init",
  "throw", "check", "check",
  "exit", "check",
  "parse", "check",
  "sql-error", "check",
  "caught", "check",
  "throw", "check",
];
const server = createStudioServer({engineDist:dist});
await new Promise((ok, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", ok);
});
const receipt = [];
let failure;
try {
  const origin = "http://127.0.0.1:" + server.address().port;
  for (const browserName of (process.argv[2] || "chromium,firefox").split(",")) {
    const browser = await pw[browserName].launch({headless:true,
      ...(browserName==="chromium" ? {args:["--no-sandbox"]} : {})});
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(90_000);
      await page.goto(origin + "/");
      const outcomes = await page.evaluate(async ({source, origin, cases}) => {
        const {NativeRuntime} = await import("/packages/runtime/src/native-runtime.mjs");
        const rt = await NativeRuntime.create({moduleURL:origin + "/engine/pbl-runtime.mjs"});
        const decoder = new TextDecoder();
        const outcomes = [];
        try {
          await rt.write("/workspace/recovery.php", source);
          for (const [index, name] of cases.entries()) {
            const response = await rt.request({
              script:"/workspace/recovery.php",
              url:origin + "/recovery.php?case=" + name,
              method:name==="check" ? "POST" : "GET",
              headers:name==="check" ? [["Content-Type","application/x-www-form-urlencoded"]] : [],
              body:name==="check" ? "value=recovered" : undefined,
            });
            const output = decoder.decode(response.body);
            const stderr = decoder.decode(response.stderr || new Uint8Array());
            const record = {index, name, status:response.status, exitCode:response.exitCode,
              output:output.slice(0,400), stderr:stderr.slice(0,500),
              sqlConnections:response.sqlConnections, nativeStatements:response.nativeStatements};
            outcomes.push(record);
            const error = message => {
              throw Error(message + ": " + JSON.stringify(record) +
                "\nPrevious requests: " + JSON.stringify(outcomes.slice(-5)));
            };
            const fatal = ["throw","sql-error","parse"].includes(name);
            if (fatal) {
              if (response.exitCode===0) error("Fatal PHP error incorrectly returned exit code zero");
              if (response.status<500) error("Fatal PHP error incorrectly returned HTTP success");
            } else if (name==="exit") {
              if (response.exitCode!==42) error("Unexpected explicit PHP exit code");
            } else {
              if (response.exitCode!==0 || response.status>=400)
                error("Healthy PHP request returned a stale exit code / HTTP error");
              let data;
              try { data = JSON.parse(output); }
              catch { error("Healthy PHP request returned invalid JSON"); }
              if (name==="init" && data.status!=="initialized") error("Setup was not initialized");
              if (name==="check" && (data.count!==1 || data.post!=="recovered" ||
                  data.method!=="POST")) error("SQL rollback, POST or session state leaked");
              if (name==="caught" && data.handled!=="expected-handled-exception")
                error("Caught exception was not recoverable");
            }
            if (response.sqlConnections!==0 || response.nativeStatements!==0)
              error("SQL connection or prepared statement remained after request");
          }
          return outcomes;
        } finally {
          rt.close();
        }
      },{source,origin,cases});
      assert.equal(outcomes.length,cases.length);
      receipt.push({browser:browserName,passed:true,cases:outcomes});
      console.log(browserName,"PHP fatal + PDO rollback + parse + explicit exit + clean requests: PASS",
        outcomes.length,"requests");
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  failure = error;
} finally {
  server.closeAllConnections();
  await new Promise(ok => server.close(ok));
  const output=resolve(root,"build-work/native-recovery");
  await mkdir(output,{recursive:true});
  await writeFile(join(output,"browser.json"),JSON.stringify({
    passed:!failure,receipts:receipt,
    failure:failure ? String(failure.message || failure) : null
  },null,2) + "\n");
}
if (failure) throw failure;
