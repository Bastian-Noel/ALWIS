import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import {
  chromium,
  firefox,
} from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
await mkdir("build-work/input-feedback", { recursive: true });
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1360, height: 900 },
      });
      page.setDefaultTimeout(60000);
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      await page.locator("#pn").fill("feedback");
      await page.locator("input[name=tpl][value=empty]").check();
      await page.locator("[data-act=create]").click();
      await page.locator("#ed1 .cm-content").waitFor();
      const action = (name, ...args) =>
        page.evaluate(
          async ({ name, args }) => {
            const { A } = await import("/apps/studio/workbench/state.mjs");
            return A[name](...args);
          },
          { name, args },
        );
      await page.evaluate(async () => {
        const { sql, A } = await import("/apps/studio/workbench/state.mjs");
        await sql(
          "CREATE TABLE feedback (id INT PRIMARY KEY AUTO_INCREMENT, number INT NOT NULL, name VARCHAR(3) NOT NULL UNIQUE)",
        );
        await A.nav("data");
        await A.selectTable("feedback");
      });
      const number = page.locator('[data-g="number"]'),
        name = page.locator('[data-g="name"]');
      await number.fill("test");
      await name.fill("ok");
      await action("ghostAdd");
      assert.equal(await number.getAttribute("aria-invalid"), "true");
      assert.equal(await name.inputValue(), "ok");
      const hint = number.locator("..").locator(".cell-error");
      const visibleHint = await hint.evaluate((el) => {
        const a = el.getBoundingClientRect(),
          b = el.parentElement.getBoundingClientRect();
        return a.height > 0 && a.bottom <= b.bottom + 1;
      });
      assert.equal(
        visibleHint,
        true,
        "field explanation must not be clipped by the table cell",
      );
      await page.screenshot({
        path: `build-work/input-feedback/invalid-${engine.name()}.png`,
      });
      assert.match(
        await page
          .locator(".cell-error")
          .allTextContents()
          .then((x) => x.join(" ")),
        /nombre entier/,
      );
      assert.equal(
        await page.evaluate(async () => {
          const { S } = await import("/apps/studio/workbench/state.mjs");
          return S.alert;
        }),
        null,
      );
      await number.fill("42");
      await name.fill("longname");
      await action("ghostAdd");
      assert.equal(await name.getAttribute("aria-invalid"), "true");
      assert.equal(await number.inputValue(), "42");
      await name.fill("abc");
      await action("ghostAdd");
      await page.waitForFunction(
        () =>
          document.querySelectorAll(".dg tbody tr:not(.ghost)").length === 1,
      );
      await number.fill("43");
      await name.fill("abc");
      await action("ghostAdd");
      await page
        .locator("#ghost-feedback")
        .filter({ hasText: "existe déjà" })
        .waitFor();
      assert.equal(await name.inputValue(), "abc");
      await page.evaluate(() =>
        window.dispatchEvent(
          new ErrorEvent("error", {
            message:
              "ResizeObserver loop completed with undelivered notifications.",
            cancelable: true,
          }),
        ),
      );
      assert.equal(await name.inputValue(), "abc");
      assert.equal(
        await page.evaluate(async () => {
          const { S } = await import("/apps/studio/workbench/state.mjs");
          return S.alert;
        }),
        null,
      );
      await page.screenshot({
        path: `build-work/input-feedback/data-${engine.name()}.png`,
      });
      await page.evaluate(async () => {
        const { eng, A } = await import("/apps/studio/workbench/state.mjs");
        await eng().fs.write(
          "/test.js",
          "let value = 1;\nconsole.log(value);\nvalue++;",
        );
        const { refreshFiles } =
          await import("/apps/studio/workbench/views/explorer.mjs");
        await refreshFiles();
        await A.nav("code");
        await A.openFile("/test.js");
        const { editorInstances } =
          await import("/apps/studio/workbench/ui.mjs");
        const view = editorInstances().find((e) => e.kind === "editor").model
          .view;
        view.dispatch({ selection: { anchor: 5 } });
        await A.editorReferences();
      });
      const panel = page.locator(".cm-help-results");
      await panel.getByRole("button", { name: /ligne 2/ }).waitFor();
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      assert.deepEqual(
        await page.evaluate(async () =>
          (
            await axe.run(document.querySelector(".cm-help-results"))
          ).violations.map((v) => v.id),
        ),
        [],
      );
      const close = panel.getByRole("button", { name: "Fermer références" });
      const box = await close.boundingBox();
      assert.ok(box.width >= 32 && box.height >= 32);
      assert.equal(await close.locator("svg").count(), 1);
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        await page.screenshot({
          path: `build-work/input-feedback/references-${theme}-${engine.name()}.png`,
        });
      }
      await close.click();
      assert.equal(await panel.count(), 0);
      assert.equal(
        await page
          .locator("#ed1 .cm-content")
          .evaluate(
            (el) =>
              el.contains(document.activeElement) ||
              el === document.activeElement,
          ),
        true,
      );
      for (const [command, label] of [
        ["editorRename", "Fermer renommer le symbole"],
        ["editorProjectSearch", "Fermer rechercher dans le projet"],
      ]) {
        await action(command);
        const dismiss = page.getByRole("button", { name: label, exact: true });
        await dismiss.click();
        assert.equal(await panel.count(), 0);
      }
      await page.evaluate(() =>
        window.dispatchEvent(
          new ErrorEvent("error", {
            message: "Unexpected test exception",
            error: new Error("Unexpected test exception"),
          }),
        ),
      );
      assert.match(
        await page.evaluate(async () => {
          const { S } = await import("/apps/studio/workbench/state.mjs");
          return S.alert.msg;
        }),
        /Unexpected test exception/,
      );
      console.log(
        engine.name() +
          ": inline input errors, constraints, preserved drafts, resize notification and reference panel passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
