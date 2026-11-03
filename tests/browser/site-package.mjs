import { schoolScenario } from "./school-scenario.mjs";
/** Exact deployment payload smoke: COI, lazy workers, no PHP replay and real clients. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createSiteServer } from "../../scripts/serve-site-package.mjs";
const root = resolve(new URL("../..", import.meta.url).pathname);
const pw = await import(
  pathToFileURL(
    resolve(root, "build-work/php/node_modules/playwright/index.mjs"),
  ).href
);
const reports = [];
const server = createSiteServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
try {
  for (const name of (process.argv[2] ?? "chromium,firefox").split(",")) {
    const browser = await pw[name].launch({
      headless: true,
      ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}),
    });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      await page.goto(origin);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      const core = await page.evaluate(async () => {
        const { assetBase } = await (
          await fetch("/release.json", { cache: "no-store" })
        ).json();
        const { NativeRuntime } = await import(
          assetBase + "/packages/runtime/src/native-runtime.mjs"
        );
        const rt = await NativeRuntime.create({
          moduleURL: new URL(
            assetBase + "/engine/pbl-runtime.mjs",
            location.href,
          ).href,
        });
        try {
          const initial = await rt.state();
          await rt.write("/workspace/plain.php", '<?php echo "plain";');
          const pure = await rt.request({ script: "/workspace/plain.php" });
          await rt.write(
            "/workspace/warm.php",
            `<?php $n=(int)@file_get_contents(__DIR__.'/once.txt')+1;file_put_contents(__DIR__.'/once.txt',$n);$p=new PDO('mysql:dbname=test','root','');$m=new mysqli('localhost','root','','test');echo json_encode([$n,$p->query('SELECT 42')->fetchColumn(),$m->query('SELECT 43')->fetch_column(),$_POST['message']??null]);`,
          );
          const first = await rt.request({
            script: "/workspace/warm.php",
            method: "POST",
            headers: [["Content-Type", "application/x-www-form-urlencoded"]],
            body: "message=posted-once",
          });
          const second = await rt.request({ script: "/workspace/warm.php" });
          return {
            isolated: crossOriginIsolated,
            initial,
            pure: {
              state: pure.pthreadWorkers,
              body: new TextDecoder().decode(pure.body),
            },
            first: {
              state: first.pthreadWorkers,
              body: new TextDecoder().decode(first.body),
              stderr: new TextDecoder().decode(first.stderr),
              exitCode: first.exitCode,
            },
            second: {
              state: second.pthreadWorkers,
              body: new TextDecoder().decode(second.body),
              exitCode: second.exitCode,
            },
          };
        } finally {
          rt.close();
        }
      });
      assert.equal(core.isolated, true);
      assert.equal(core.initial.pthreadWorkers.created, 0);
      assert.equal(core.pure.state.created, 0);
      assert.equal(core.first.exitCode, 0, core.first.stderr);
      assert.deepEqual(JSON.parse(core.first.body), [
        1,
        42,
        "43",
        "posted-once",
      ]);
      assert.equal(core.first.state.created, 16);
      assert.deepEqual(JSON.parse(core.second.body), [2, 42, "43", null]);
      assert.equal(core.second.state.created, 16);
      const key = "package-" + crypto.randomUUID();
      await page.locator("#pn").fill(key);
      await page.locator("[data-act=create]").click();
      await page.locator("#ed1 .cm-content").waitFor();
      const school = await schoolScenario(
        page,
        (await (await fetch(origin + "/release.json")).json()).assetBase,
      );
      const editor = page.locator("#ed1 .cm-content");
      const original = await page.locator("#ed1").evaluate((el) => el.value);
      await editor.fill("!");
      await editor.press("Control+End");
      await editor.press("Enter");
      assert.match(await editor.innerText(), /<!doctype html>/i);
      await editor.fill("ul>li*3");
      await editor.press("Control+End");
      await page.locator('#codeTools button[data-tool="Emmet"]').click();
      assert.equal((await editor.innerText()).match(/<li>/g)?.length, 3);
      await editor.fill("<?php foreach");
      await editor.press("Control+End");
      await editor.press("Tab");
      assert.match(
        await editor.innerText(),
        /foreach \(\$items as \$item\) \{/,
      );
      await editor.fill(original);
      await page.locator('#codeTools button[data-tool="Formater"]').click();
      await page.waitForFunction(() =>
        document
          .querySelector("#ed1")
          .dataset.serviceStatus.startsWith("Mise en forme terminée"),
      );
      const opening = page.waitForEvent("popup");
      await page.evaluate(async () => {
        const { A } = await import(
          (await (await fetch("/release.json")).json()).assetBase +
            "/apps/studio/workbench/state.mjs"
        );
        A.openWindow();
      });
      const client = await opening;
      await client.locator("#session").waitFor();
      await client.close();
      await page.evaluate(async () => {
        const { A } = await import(
          (await (await fetch("/release.json")).json()).assetBase +
            "/apps/studio/workbench/state.mjs"
        );
        await A.save();
        await A.close();
      });
      await page.locator("#launcher").waitFor();
      reports.push({
        browser: name,
        version: browser.version(),
        passed: true,
        core,
        school,
        studio:
          "project/34 tables/4 sessions/production Emmet/snippets/lazy formatter/PDO client/save/close passed",
      });
      console.log(
        name,
        "exact deployment package passed",
        JSON.stringify(core.first.state),
      );
    } finally {
      await browser.close();
    }
  }
  await writeFile(
    resolve(root, "build-work/site-smoke.json"),
    JSON.stringify(reports, null, 2) + "\n",
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
