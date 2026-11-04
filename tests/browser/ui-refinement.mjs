import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import {
  chromium,
  firefox,
} from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
await mkdir("build-work/ui-refinement", { recursive: true });
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
      });
      page.setDefaultTimeout(60000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      assert.equal(await page.locator(".mark .unit").count(), 0);
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.locator(".mark-name").isVisible(), true);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator("#pn").fill("refinement");
      await page.locator("input[name=tpl][value=empty]").check();
      await page.locator("[data-act=create]").click();
      await page.locator("#ed1 .cm-content").waitFor();
      assert.equal(
        await page.locator("[data-act=exCollapseAll]").isDisabled(),
        true,
      );
      await page.evaluate(async () => {
        const { A } = await import("/apps/studio/workbench/state.mjs");
        A.editorSearch();
      });
      const search = page.locator(".alwis-search");
      await search.waitFor();
      assert.equal(
        await search.locator("[data-command=next]").isDisabled(),
        true,
      );
      await search.locator("[name=search]").fill("Bienvenue");
      assert.equal(
        await search.locator("[data-command=next]").isEnabled(),
        true,
      );
      assert.equal(await search.locator("[data-command=next] svg").count(), 1);
      await search.locator("[name=search]").fill("absolutely_missing");
      assert.equal(
        await search.locator("[data-command=next]").isDisabled(),
        true,
      );
      await search.locator("[data-command=close]").click();
      await page.evaluate(async () => {
        const { A } = await import("/apps/studio/workbench/state.mjs");
        await A.nav("schema");
      });
      assert.equal(
        await page.locator("#v-schema [data-act=relationForm]").isDisabled(),
        true,
      );
      await page.evaluate(async () => {
        const { A, sql } = await import("/apps/studio/workbench/state.mjs");
        await sql("CREATE TABLE items(id INT PRIMARY KEY, parent_id INT NULL)");
        await A.nav("data");
        await A.nav("schema");
      });
      assert.equal(
        await page.locator("#v-schema [data-act=relationForm]").isEnabled(),
        true,
      );
      assert.equal(
        await page.locator("#v-schema [data-act=joinTable]").isDisabled(),
        true,
      );
      await page.locator("#v-schema [data-act=relationForm]").click();
      await page.locator("#modal").waitFor();
      assert.equal(await page.locator("#modal [data-v=no]").count(), 1);
      await page.locator("#modal .dlg-x").click();
      await page.locator("#modal").waitFor({ state: "hidden" });
      await page.evaluate(async () => {
        const { A } = await import("/apps/studio/workbench/state.mjs");
        await A.nav("code");
        await A.pvOpen("/index.php");
      });
      const grip = page.locator("#previewResize .grip");
      await page.mouse.move(10, 10);
      assert.equal(
        await grip.evaluate((el) => getComputedStyle(el).opacity),
        "0",
      );
      await page.locator("#previewResize").focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      assert.equal(
        await grip.evaluate((el) => getComputedStyle(el).opacity),
        "1",
      );
      await page.evaluate(async () => {
        const { toast } = await import("/apps/studio/workbench/ui.mjs");
        document.querySelector("#toast").replaceChildren();
        toast("Test du focus", null, { duration: 600 });
      });
      await page.locator(".toast-item").hover();
      await page.locator(".toast-x").focus();
      await page.mouse.move(10, 10);
      await page.waitForTimeout(950);
      assert.equal(await page.locator(".toast-item").count(), 1);
      await page.locator(".toast-x").click();
      await page.locator(".toast-item").waitFor({ state: "detached" });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(async (theme) => {
          const { S, A } = await import("/apps/studio/workbench/state.mjs");
          if (S.theme !== theme) A.theme();
          const { toast } = await import("/apps/studio/workbench/ui.mjs");
          document.querySelector("#toast").replaceChildren();
          toast("Projet enregistré", null, {
            kind: "success",
            duration: 10000,
          });
          toast("Vérifiez les valeurs avant de continuer", null, {
            kind: "warn",
            duration: 10000,
          });
          toast("Une valeur est invalide", null, {
            kind: "error",
            duration: 10000,
          });
        }, theme);
        assert.equal(await page.locator(".toast-item[role=alert]").count(), 1);
        await page.screenshot({
          path: `build-work/ui-refinement/notifications-${engine.name()}-${theme}.png`,
        });
      }
      assert.deepEqual(errors, []);
      console.log(
        `${engine.name()}: text-only brand, mobile, radios, search disabled states, schema self-relation, modal close, grips and notification focus passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
