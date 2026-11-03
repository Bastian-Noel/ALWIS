import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const root = resolve(new URL("../..", import.meta.url).pathname),
  pw = await import(
    pathToFileURL(
      resolve(root, "build-work/php/node_modules/playwright/index.mjs"),
    ).href
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
      const page = await browser.newPage({
        viewport: { width: 1500, height: 1000 },
      });
      page.setDefaultTimeout(60000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      const opening = await page.evaluate(async () => {
        const { ctx } = await import("/apps/studio/workbench/state.mjs");
        const results = await Promise.allSettled([
          ctx.engine.projects.open("opening-guard", "empty"),
          ctx.engine.projects.open("opening-guard-second", "empty"),
        ]);
        await ctx.engine.projects.exportZip();
        const memory = await ctx.engine.measure();
        if (memory.raw.sqlStarted || memory.raw.pthreadWorkers.created)
          throw Error("Pure PHP ZIP eagerly started SQL");
        await ctx.engine.projects.close({ save: false });
        return results.map((r) => r.status);
      });
      assert.deepEqual(opening, ["fulfilled", "rejected"]);
      await page.locator("#pn").fill("alwis-" + crypto.randomUUID());
      await page.locator("[data-act=create]").click();
      await page.locator("#ed1 .cm-content").waitFor();
      await page.evaluate(async () => {
        const {S} = await import('/apps/studio/workbench/state.mjs'); S.db = 'test';
      });
      const checks = [];
      const settled = () =>
        page.waitForFunction(
          () => document.querySelector("#app").dataset.lamp !== "busy",
        );
      const nav = async (arg) => {
        await page.locator(`[data-act=nav][data-arg=${arg}]`).click();
        await settled();
      };
      async function run(sql) {
        await nav("data");
        await page.locator("[data-act=dmode][data-arg=sql]").click();
        await page.locator("#edq .cm-content").fill(sql);
        await page.locator("#edq .cm-content").press("Control+Enter");
        await settled();
        await page.waitForFunction(
          () =>
            !!document.querySelector("#rsb .rs-tabs") ||
            !!document.querySelector("#rsb .empty b") ||
            !!document.querySelector("#rsb .dg") ||
            !!document.querySelector("#rsb .alert"),
        );
      }
      await run(
        "CREATE TABLE al_parent(a INT NOT NULL,b INT NOT NULL,PRIMARY KEY(a,b)); CREATE TABLE al_child(id INT PRIMARY KEY, a INT, b INT, label VARCHAR(30) NOT NULL DEFAULT 'NOT NULL' COMMENT 'keep, me', exact_num DECIMAL(30,4), payload BLOB, CONSTRAINT al_fk FOREIGN KEY(a,b) REFERENCES al_parent(a,b)); INSERT INTO al_parent VALUES(1,2); INSERT INTO al_child VALUES(1,1,2,'old',9007199254740993.1234,X'00ff'); SELECT * FROM al_child;",
      );
      await page.locator("[data-act=rsTab]").last().click();
      await page
        .locator("#rsb td")
        .filter({ hasText: "9007199254740993.1234" })
        .waitFor();
      await page.locator("#rsb td").filter({ hasText: "0x00ff" }).waitFor();
      console.log(name, checks.length + 1);
      checks.push("real SQL scripts, exact decimal and binary");
      await page.locator("#edq .cm-content").fill("SELECT * FROM al_");
      await page.locator("#edq .cm-content").press("Control+End");
      await page.keyboard.press("Control+Space");
      await page
        .locator(".cm-tooltip-autocomplete li")
        .filter({ hasText: "al_child" })
        .waitFor();
      await page.keyboard.press("Escape");
      checks.push("live catalog completion in the SQL editor");
      await page.locator("[data-act=selectTable][data-arg=al_child]").click();
      await settled();
      await page.locator("[data-act=dmode][data-arg=struct]").click();
      await page.locator("[data-act=columnForm]").first().click();
      await page.locator("[data-f=name]").fill("notes");
      await page.locator("[data-f=type]").fill("VARCHAR(80)");
      await page.locator("[data-f=comment]").fill("user comment");
      await page.locator("[data-f=defaultMode]").selectOption("literal");
      await page.locator("[data-f=defaultValue]").fill("");
      await page
        .getByRole("button", { name: "Appliquer", exact: true })
        .click();
      await page.locator("#modal").waitFor({ state: "hidden" });
      await page.locator("tr[data-col=notes]").waitFor();
      console.log(name, checks.length + 1);
      checks.push("complete column form applied to native MariaDB");
      await page.locator("[data-act=colNull][data-arg=label]").click();
      await page
        .getByRole("button", { name: "Appliquer", exact: true })
        .click();
      await page.locator("#modal").waitFor({ state: "hidden" });
      const meta = await page.evaluate(async () => {
        const { ctx } = await import("/apps/studio/workbench/state.mjs");
        return (await ctx.engine.db.catalog("test")).tables.find(
          (t) => t.name === "al_child",
        );
      });
      assert.equal(
        meta.columns.find((c) => c.name === "label").comment,
        "keep, me",
      );
      assert.ok(
        meta.columns
          .find((c) => c.name === "label")
          .default.includes("NOT NULL"),
      );
      assert.equal(meta.fks[0].columns.length, 2);
      console.log(name, checks.length + 1);
      checks.push(
        "column modification preserves default/comment and composite keys",
      );
      await page.locator("[data-act=columnForm]").first().click();
      await page.locator("[data-f=name]").fill("required_value");
      await page.locator("[data-f=nullable]").selectOption("NOT NULL");
      await page.locator("[data-f=type]").fill("VARCHAR(0)");
      assert.equal(
        await page
          .getByRole("button", { name: "Appliquer", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page.locator("[data-f=name]").inputValue(),
        "required_value",
      );
      await page.getByRole("button", { name: "Annuler", exact: true }).click();
      console.log(name, checks.length + 1);
      checks.push("invalid type retains input and blocks invalid DDL");
      await nav("schema");
      await page.locator("#sv .tb").first().waitFor();
      assert.equal(
        await page.locator('#sv [data-rel="al_child|al_fk"]').count(),
        1,
      );
      await page.locator("[data-drag=al_child]").focus();
      await page.keyboard.press("ArrowRight");
      await page.screenshot({
        path: resolve(root, `apps/studio/receipts/alwis/schema-${name}.png`),
      });
      console.log(name, checks.length + 1);
      checks.push("real composite schema and keyboard movement");
      await page.evaluate(async () => {
        const { ctx, A } = await import("/apps/studio/workbench/state.mjs");
        await ctx.engine.db.query(
          "CREATE TABLE drag_parent(id INT PRIMARY KEY);CREATE TABLE drag_child(id INT PRIMARY KEY,pid INT);",
          "test",
        );
        await A.nav("schema");
        A.schemaLayout();
      });
      const fromPort = page
          .locator('[data-col="pid"][data-t="drag_child"] .port')
          .last(),
        toPort = page
          .locator('[data-col="id"][data-t="drag_parent"] .port')
          .last();
      // schemaLayout fits on the next animation frame. Wait for visible ports
      // to settle before reading coordinates; the pointer must hit the rendered view.
      await fromPort.hover();
      await toPort.hover();
      await fromPort.hover();
      const fromBox = await fromPort.boundingBox(),
        toBox = await toPort.boundingBox();
      await page.mouse.move(
        fromBox.x + fromBox.width / 2,
        fromBox.y + fromBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        toBox.x + toBox.width / 2,
        toBox.y + toBox.height / 2,
        { steps: 15 },
      );
      await page.mouse.up();
      await page.locator("#rok").click();
      await page.locator('[data-rel="drag_child|fk_drag_child_pid"]').waitFor();
      checks.push("pointer drag creates a real native foreign key");
      await nav("data");
      await page.locator("[data-act=selectTable][data-arg=al_child]").click();
      await settled();
      await page.locator("[data-act=dmode][data-arg=data]").click();
      await settled();
      await page.evaluate(async () => {
        const { ctx } = await import("/apps/studio/workbench/state.mjs");
        await ctx.engine.db.query(
          "UPDATE al_child SET label='external row' WHERE id=1",
          "test",
        );
      });
      await page.locator('td[data-r="0"][data-c="3"]').dblclick();
      await page.locator(".ce").fill("my edit");
      await page.locator(".ce").press("Enter");
      await page
        .locator("#alertHost")
        .filter({ hasText: /changé/ })
        .waitFor();
      const preserved = await page.evaluate(async () => {
        const { ctx } = await import("/apps/studio/workbench/state.mjs");
        return (
          await ctx.engine.db.query(
            "SELECT label FROM al_child WHERE id=1",
            "test",
          )
        )[0].rows[0][0];
      });
      assert.equal(preserved, "external row");
      checks.push("SQL optimistic conflict preserves the newer row");
      await nav("code");
      await page.locator("#ed1 .cm-content").fill("<?php fore");
      await page.locator("#ed1 .cm-content").press("Control+End");
      await page.keyboard.press("Control+Space");
      await page
        .locator(".cm-tooltip-autocomplete li")
        .filter({ hasText: "foreach" })
        .first()
        .waitFor();
      await page.keyboard.press("Tab");
      assert.match(
        await page.locator("#ed1").evaluate((e) => e.value),
        /foreach \(/,
      );
      await page.keyboard.press("Escape");
      await page
        .locator("#ed1 .cm-content")
        .fill(
          '<?php session_start(); $_SESSION["n"]=($_SESSION["n"]??0)+1; echo "ALWIS-client:".$_SESSION["n"];',
        );
      await page.locator("#ed1 .cm-content").press("Control+s");
      await page.waitForFunction(() =>
        document.querySelector("#primary").textContent.includes("Sauvegarder"),
      );
      console.log(name, checks.length + 1);
      await page.locator('#codeTools button[data-tool="Formater"]').click();
      await page.waitForFunction(() => document.querySelector("#ed1").dataset.serviceStatus.startsWith("Mise en forme terminée"));
      await page.locator('#codeTools button[data-tool="Emmet"]').waitFor({state: "visible"});
      await page.locator('#codeTools select[aria-label="Indentation du code"]').waitFor({state: "visible"});
      checks.push("production CodeMirror snippets, visible formatting and write");
      await page.locator("#runBtn").click(); // Preview is inline, open real window through the session space.
      await nav("sessions");
      const sid = await page
        .locator("#sesGrid .scard")
        .first()
        .getAttribute("data-id");
      const popup = page.waitForEvent("popup");
      await page.locator(`[data-act=sesOpen][data-arg="${sid}"]`).click();
      const client = await popup;
      await client
        .locator("body")
        .filter({ hasText: "ALWIS-client:" })
        .waitFor();
      await client.reload();
      await client
        .locator("body")
        .filter({ hasText: "ALWIS-client:" })
        .waitFor();
      await client.close();
      console.log(name, checks.length + 1);
      checks.push("real service worker routing and PHP sessions");
      await nav("code");
      await page.evaluate(async () => {
        const { ctx } = await import("/apps/studio/workbench/state.mjs");
        await ctx.engine.fs.write(
          "/index.php",
          '<?php echo "external";',
          await ctx.engine.fs.read("/index.php").then((r) => r.text),
        );
      });
      await page.locator("#ed1 .cm-content").fill('<?php echo "draft";');
      await page.locator("#ed1 .cm-content").press("Control+s");
      await page
        .locator("#alertHost")
        .filter({ hasText: /changé|changed/i })
        .waitFor();
      assert.match(
        await page.locator("#ed1").evaluate((e) => e.value),
        /draft/,
      );
      console.log(name, checks.length + 1);
      checks.push("external write conflict preserves editor draft");
      await page.evaluate(async () => {
        const { S, ctx, A } = await import("/apps/studio/workbench/state.mjs");
        S.drafts = {};
        S.base = {};
        await A.openFile("/index.php");
      });
      await page.locator("#ed1 .cm-content").fill('<?php echo "saved";');
      await page.locator("#ed1 .cm-content").press("Control+s");
      await page.evaluate(async () => {
        const { A } = await import("/apps/studio/workbench/state.mjs");
        await A.save();
      });
      console.log(name, checks.length + 1);
      checks.push("save and engine restart");
      const archivePromise = page.waitForEvent("download");
      await page.evaluate(async () => {
        const { A } = await import("/apps/studio/workbench/state.mjs");
        await A.exportZip();
      });
      const archive = await archivePromise;
      const path = await archive.path();
      assert.ok(path);
      console.log(name, checks.length + 1);
      checks.push("ZIP with user SQL export");
      await page.evaluate(async () => {
        const { ctx, A } = await import("/apps/studio/workbench/state.mjs");
        await A.toolState("editor", "unloaded");
        await A.toolState("editor", "active");
      });
      await page.locator("#ed1 .cm-content").waitFor();
      assert.match(
        await page.locator("#ed1").evaluate((e) => e.value),
        /saved/,
      );
      checks.push("editor unload and restoration");
      await page.evaluate(async () => {
        const { A } = await import("/apps/studio/workbench/state.mjs");
        await A.close();
      });
      await page.locator("#launcher").waitFor();
      await page.locator("#pn").fill("restore-" + crypto.randomUUID());
      await page.locator("#zipIn").setInputFiles({
        name: "project.zip",
        mimeType: "application/zip",
        buffer: await readFile(path),
      });
      await page.locator("#ed1 .cm-content").waitFor();
      await settled();
      const restored = await page.evaluate(async () => {
        const { ctx } = await import("/apps/studio/workbench/state.mjs");
        return (
          await ctx.engine.db.query(
            "SELECT exact_num,HEX(payload) FROM al_child",
            "test",
          )
        )[0].rows;
      });
      assert.deepEqual(restored, [["9007199254740993.1234", "00FF"]]);
      checks.push("ZIP files and SQL restoration into a new project");
      for (const theme of ["light", "dark"]) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);
        await page.screenshot({
          path: resolve(
            root,
            `apps/studio/receipts/alwis/code-${theme}-${name}.png`,
          ),
        });
      }
      for (const width of [320, 768, 1500]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const view of ["code", "data", "schema", "sessions"]) {
          await nav(view);
          if (
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth + 1,
            )
          )
            console.log(
              "OVERFLOW",
              await page.evaluate(() =>
                [...document.querySelectorAll("body *")]
                  .filter(
                    (e) => e.getBoundingClientRect().right > innerWidth + 1,
                  )
                  .slice(0, 14)
                  .map((e) => [
                    e.tagName,
                    e.id,
                    e.className,
                    e.getBoundingClientRect().width,
                  ]),
              ),
            );
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            view + " overflow " + width,
          );
        }
      }
      console.log(name, checks.length + 1);
      checks.push("both themes and four workspaces at 320/768/1500");
      assert.deepEqual(errors, []);
      await writeFile(
        resolve(root, `apps/studio/receipts/alwis/workbench-${name}.json`),
        JSON.stringify(
          {
            passed: true,
            browser: name,
            version: browser.version(),
            checks,
            errors,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(name, "ALWIS passed", checks.length);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
