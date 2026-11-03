/** Regression checks for row identity, exact values and lightweight navigation. */
import assert from "node:assert/strict";
import {
  chromium,
  firefox,
} from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const server = createStudioServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(60000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      await page.locator("#pn").fill("integrity");
      await page.locator("[data-act=create]").click();
      await page.locator("#ed1 .cm-content").waitFor();
      await page.evaluate(async () => {
        const { A, sql } = await import("/apps/studio/workbench/state.mjs");
        await A.nav("data");
        await sql(
          "CREATE TABLE exact_values (id BIGINT PRIMARY KEY, amount DECIMAL(30,10), bytes VARBINARY(20));",
        );
        await sql("CREATE TABLE many_rows (id INT PRIMARY KEY);");
        await sql(
          "INSERT INTO many_rows VALUES " +
            Array.from({ length: 105 }, (_, i) => `(${i + 1})`).join(","),
        );
        const { refreshDb } =
          await import("/apps/studio/workbench/views/data.mjs");
        await refreshDb();
        await A.selectTable("exact_values");
      });
      await page.evaluate(async () => {
        const { A } = await import("/apps/studio/workbench/state.mjs");
        void A.insertAdvanced();
      });
      for (const [column, mode, value] of [
        ["0", "text", "9007199254740993"],
        ["1", "text", "12345678901234567890.1234567890"],
        ["2", "hex", "0xz"],
      ]) {
        await page.locator(`[data-mode="${column}"]`).selectOption(mode);
        await page.locator(`[data-value="${column}"]`).fill(value);
      }
      await page.locator("#modal [data-v=ok]").click();
      await page
        .locator("#insert-error")
        .filter({ hasText: "nombre pair" })
        .waitFor();
      assert.equal(await page.locator("#modal").isVisible(), true);
      await page.locator('[data-value="2"]').fill("00ff41");
      await page.locator("#modal [data-v=ok]").click();
      await page.waitForFunction(async () => {
        const { S } = await import("/apps/studio/workbench/state.mjs");
        return S.grid?.rows.length === 1 && S.lamp !== "busy";
      });
      const values = await page.evaluate(async () => {
        const { eng, S } = await import("/apps/studio/workbench/state.mjs");
        return (
          await eng().db.query(
            "SELECT CAST(id AS CHAR), CAST(amount AS CHAR), HEX(bytes) FROM exact_values",
            S.db,
          )
        )[0].rows;
      });
      assert.deepEqual(values, [
        ["9007199254740993", "12345678901234567890.1234567890", "00FF41"],
      ]);
      const navigation = await page.evaluate(async () => {
        const { A, S, eng } = await import("/apps/studio/workbench/state.mjs");
        await A.selectTable("many_rows");
        const db = eng().db,
          original = db.catalog;
        let catalogs = 0;
        db.catalog = function (...args) {
          catalogs++;
          return original.apply(this, args);
        };
        try {
          S.sel.add(0);
          await A.sort("id");
          const afterSort = S.sel.size;
          S.sel.add(99);
          S.cell = { r: 99, c: 0 };
          await A.page(1);
          const afterPage = S.sel.size;
          document.querySelector("#dataSearch").value = "105";
          await A.searchRows();
          return { afterSort, afterPage, catalogs, total: S.total };
        } finally {
          db.catalog = original;
        }
      });
      assert.deepEqual(navigation, {
        afterSort: 0,
        afterPage: 0,
        catalogs: 0,
        total: 1,
      });
      await page.evaluate(async () => {
        const { A } = await import("/apps/studio/workbench/state.mjs");
        await A.searchReset();
      });
      const cell = page.locator('#gw td[data-r="0"][data-c="0"]');
      await page.locator('#gw [data-g="id"]').fill("999");
      await cell.click();
      await page.locator("#gw").evaluate((el) => {
        window.originalGrid = el;
      });
      await cell.press("ArrowDown");
      assert.equal(
        await page.evaluate(
          () => window.originalGrid === document.querySelector("#gw"),
        ),
        true,
      );
      assert.equal(await page.locator('#gw td[tabindex="0"]').count(), 1);
      assert.equal(
        await page
          .locator('#gw td[data-r="1"][data-c="0"]')
          .evaluate((el) => el === document.activeElement),
        true,
      );
      assert.equal(await page.locator('#gw [data-g="id"]').inputValue(), "999");
      assert.deepEqual(errors, []);
      console.log(
        engine.name() +
          ": exact BIGINT/DECIMAL, binary validation, selection reset, no catalog reload, stable keyboard grid passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
