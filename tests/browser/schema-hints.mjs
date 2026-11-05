import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import {
  chromium,
  firefox,
} from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
await mkdir("build-work/schema-hints", { recursive: true });
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      page.setDefaultTimeout(60000);
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      await page.locator("#pn").fill("relations");
      await page.locator("input[name=tpl][value=empty]").check();
      await page.locator("[data-act=create]").click();
      await page.locator("#ed1 .cm-content").waitFor();
      await page.evaluate(async () => {
        const { A, sql } = await import("/apps/studio/workbench/state.mjs");
        await sql("CREATE TABLE parents (id INT PRIMARY KEY)");
        await sql(
          "CREATE TABLE children (id INT PRIMARY KEY, parent_id INT, CONSTRAINT fk_parent FOREIGN KEY(parent_id) REFERENCES parents(id) ON DELETE RESTRICT ON UPDATE CASCADE)",
        );
        await sql("CREATE TABLE cover (id INT PRIMARY KEY, other INT)");
        await A.nav("schema");
      });
      await page.locator('[data-rel="children|fk_parent"]').waitFor();
      await page.evaluate(async () => {
        const { S } = await import("/apps/studio/workbench/state.mjs");
        const { drawSchema } =
          await import("/apps/studio/workbench/views/schema.mjs");
        const label = document.querySelector("[data-rel] .lab");
        const { e: x, f: y } = label.transform.baseVal.consolidate().matrix;
        S.pos.cover = [x - 116, y - 40];
        drawSchema();
      });
      const link = page.locator('[data-rel="children|fk_parent"]');
      await link.dispatchEvent("pointerover");
      const overlay = page.locator("#schema-link-overlay");
      assert.equal(await overlay.locator(".lab").count(), 1);
      assert.equal(
        await overlay.evaluate(
          (el) => el === el.parentElement.lastElementChild,
        ),
        true,
      );
      assert.equal(
        await overlay.evaluate((el) => getComputedStyle(el).pointerEvents),
        "none",
      );
      assert.equal(
        await overlay
          .locator(".lab")
          .evaluate((el) => getComputedStyle(el).opacity),
        "1",
      );
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        await page.screenshot({
          animations: "disabled",
          path: `build-work/schema-hints/overlay-${theme}-${engine.name()}.png`,
        });
      }
      await page.locator("#sv").dispatchEvent("pointerleave");
      assert.equal(await overlay.locator(".lab").count(), 0);
      await link.dispatchEvent("pointerdown", { clientX: 600, clientY: 260 });
      await link.dispatchEvent("pointerup", { clientX: 600, clientY: 260 });
      await page.locator("#rd").waitFor();
      assert.match(
        await page.locator("#rd option:checked").textContent(),
        /Empêcher/,
      );
      assert.match(
        await page.locator("#rd-help").textContent(),
        /parents.*children/,
      );
      await page.locator("#rd").selectOption("CASCADE");
      await page.locator("#ru").selectOption("RESTRICT");
      assert.match(
        await page.locator("#rd-help").textContent(),
        /supprimera aussi/,
      );
      assert.match(
        await page.locator("#ru-help").textContent(),
        /ne peut pas être modifiée/,
      );
      assert.equal(
        await page.locator("#rd").getAttribute("aria-describedby"),
        "rd-help",
      );
      await page.screenshot({
        animations: "disabled",
        path: `build-work/schema-hints/rules-${engine.name()}.png`,
      });
      await page.locator("#rok").click();
      await page.locator("#rd").waitFor({ state: "detached" });
      assert.deepEqual(
        await page.evaluate(async () => {
          const { S } = await import("/apps/studio/workbench/state.mjs");
          const fk = S.cat.tables.find((t) => t.name === "children").fks[0];
          return [fk.onDelete, fk.onUpdate];
        }),
        ["CASCADE", "RESTRICT"],
      );
      await page.evaluate(async () => {
        const { A } = await import("/apps/studio/workbench/state.mjs");
        A.relationForm({ child: "children", parent: "parents" });
      });
      await page.locator(".relation-options summary").click();
      await page.locator("#rel-delete").selectOption("SET NULL");
      assert.match(
        await page.locator("#rel-delete-help").textContent(),
        /conservées.*NULL/,
      );
      await page.locator("#rel-update").selectOption("CASCADE");
      assert.match(
        await page.locator("#rel-update-help").textContent(),
        /mises à jour/,
      );
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page
          .locator("#modal")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
        true,
      );
      await page.locator("#modal [data-v=no]").click();
      console.log(
        engine.name() +
          ": tooltip overlay, French rule explanations and saved SQL semantics passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
