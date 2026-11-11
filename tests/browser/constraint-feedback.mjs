import {waitForAsyncCondition} from './async-condition.mjs';
import { readBrowserProcessMemory } from "../../benchmarks/browser-process-memory.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  chromium,
  firefox,
} from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
await mkdir("build-work/constraint-feedback", { recursive: true });
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      page.setDefaultTimeout(60000);
      const logs = [];
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning") logs.push(m.text());
      });
      const action = (name, ...args) =>
        page.evaluate(
          async ({ name, args }) => {
            const { A } = await import("/apps/studio/workbench/state.mjs");
            return A[name](...args);
          },
          { name, args },
        );
      const query = (statement) =>
        page.evaluate(async (statement) => {
          const { eng, S } = await import("/apps/studio/workbench/state.mjs");
          return eng().db.query(statement, S.db);
        }, statement);
      const noAlert = async () =>
        assert.equal(
          await page.evaluate(async () => {
            const { S } = await import("/apps/studio/workbench/state.mjs");
            return S.alert;
          }),
          null,
        );
      const edit = async (column, value) => {
        await page.locator(`td[data-r="0"][data-c="${column}"]`).dblclick();
        const input = page.locator("td.edit .ce");
        await input.fill(value);
        await input.press("Enter");
        return input;
      };
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      await page.locator("#pn").fill("constraints");
      await page.locator("input[name=tpl][value=empty]").check();
      await page.locator("[data-act=create]").click();
      await page.locator("#ed1 .cm-content").waitFor();
      const phpMemory = await page.evaluate(async () => {
        const { eng } = await import("/apps/studio/workbench/state.mjs");
        return eng().measure();
      });
      const phpProcessMemory = await readBrowserProcessMemory();
      await page.evaluate(async () => {
        const { A, sql } = await import("/apps/studio/workbench/state.mjs");
        await sql("CREATE TABLE departments (id INT PRIMARY KEY)");
        await sql(
          "CREATE TABLE teachers (id INT PRIMARY KEY, department_id INT, CONSTRAINT `2` FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE RESTRICT ON UPDATE RESTRICT)",
        );
        await sql("INSERT INTO departments VALUES (1)");
        await sql("INSERT INTO teachers VALUES (1,1)");
        await A.nav("data");
        await A.selectTable("teachers");
      });
      await page.locator('[data-g="id"]').fill("2");
      await page.locator('[data-g="department_id"]').fill("999");
      await action("ghostAdd");
      assert.equal(
        await page
          .locator('[data-g="department_id"]')
          .getAttribute("aria-invalid"),
        "true",
      );
      await noAlert();
      await page.locator('[data-g="id"]').fill("");
      await page.locator('[data-g="department_id"]').fill("");
      let input = await edit(1, "999");
      await page.locator('.ce[aria-invalid="true"]').waitFor();
      await noAlert();
      assert.equal(await input.inputValue(), "999");
      assert.match(
        await page.locator("td.edit .cell-error").textContent(),
        /aucune ligne de « departments »/,
      );
      await page.screenshot({
        path: `build-work/constraint-feedback/invalid-fk-${engine.name()}.png`,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Voir « departments »", exact: true })
        .click();
      await page.locator('td[data-r="0"][data-c="0"]').waitFor();
      input = await edit(0, "2");
      await page.locator('.ce[aria-invalid="true"]').waitFor();
      await noAlert();
      await page
        .getByRole("button", {
          name: "Configurer la propagation…",
          exact: true,
        })
        .click();
      await page.locator(".relation-options summary").click();
      assert.equal(await page.locator("#rel-update").inputValue(), "CASCADE");
      await page.locator("#modal [data-v=no]").click();
      assert.equal(await input.inputValue(), "2");
      await page
        .getByRole("button", {
          name: "Configurer la propagation…",
          exact: true,
        })
        .click();
      await page.locator("#modal [data-v=ok]").click();
      await page.locator("#modal").waitFor({ state: "hidden" });
      assert.equal(
        String((await query("SELECT id FROM departments"))[0].rows[0][0]),
        "1",
        "configuring propagation must not retry the rejected edit",
      );
      await edit(0, "2");
      await page.locator("td.edit").waitFor({ state: "detached" });
      assert.equal(
        String(
          (await query("SELECT department_id FROM teachers"))[0].rows[0][0],
        ),
        "2",
      );
      await action("deleteRows", "0");
      await page.locator("#action-menu [data-ok]").click();
      await page
        .locator("#data-feedback")
        .filter({ hasText: "Suppression bloquée" })
        .waitFor();
      await noAlert();
      assert.equal(
        String((await query("SELECT COUNT(*) FROM departments"))[0].rows[0][0]),
        "1",
      );
      await page
        .getByRole("button", { name: "Voir « teachers »", exact: true })
        .click();
      assert.deepEqual(
        await page.evaluate(async () => {
          const { S } = await import("/apps/studio/workbench/state.mjs");
          return { table: S.table, filter: S.filter };
        }),
        { table: "teachers", filter: { c: "department_id", op: "=", v: "2" } },
      );
      await action("selectTable", "departments");
      await action("deleteRows", "0");
      await page.locator("#action-menu [data-ok]").click();
      await page
        .getByRole("button", {
          name: "Configurer la propagation…",
          exact: true,
        })
        .click();
      await page.locator(".relation-options summary").click();
      assert.equal(await page.locator("#rel-delete").inputValue(), "CASCADE");
      await page.locator("#modal [data-v=ok]").click();
      await page.locator("#modal").waitFor({ state: "hidden" });
      assert.equal(
        String((await query("SELECT COUNT(*) FROM teachers"))[0].rows[0][0]),
        "1",
        "configuring cascade deletion must not delete existing data",
      );
      await action("deleteRows", "0");
      await page.locator("#action-menu [data-ok]").click();
      await waitForAsyncCondition(page, async () => {
        const { S } = await import("/apps/studio/workbench/state.mjs");
        return S.total === 0;
      });
      assert.equal(
        String((await query("SELECT COUNT(*) FROM teachers"))[0].rows[0][0]),
        "0",
      );
      await action("selectTable", "teachers");
      await page.evaluate(async () => {
        const { A } = await import("/apps/studio/workbench/state.mjs");
        void A.insertAdvanced();
      });
      await page.locator('[data-mode="0"]').selectOption("text");
      await page.locator('[data-value="0"]').fill("3");
      await page.locator('[data-mode="1"]').selectOption("text");
      await page.locator('[data-value="1"]').fill("999");
      await page.locator("#modal [data-v=ok]").click();
      await page
        .locator('#modal [data-value="1"][aria-invalid="true"]')
        .waitFor();
      await page
        .getByRole("button", { name: "Voir « departments »", exact: true })
        .click();
      await page.locator("#modal").waitFor({ state: "hidden" });
      await noAlert();
      await page.evaluate(async () => {
        const { sql, A } = await import("/apps/studio/workbench/state.mjs");
        await sql("CREATE TABLE protected_parent(id INT PRIMARY KEY)");
        await sql(
          "CREATE TABLE protected_child(id INT PRIMARY KEY,pid INT,CONSTRAINT guard FOREIGN KEY(pid) REFERENCES protected_parent(id))",
        );
        await sql("INSERT INTO protected_parent VALUES(1),(2)");
        await sql("INSERT INTO protected_child VALUES(1,2)");
        await A.selectTable("protected_parent");
        const { S } = await import("/apps/studio/workbench/state.mjs");
        S.sel = new Set([0, 1]);
      });
      await action("deleteRows", "sel");
      await page.locator("#action-menu [data-ok]").click();
      await page
        .locator("#data-feedback")
        .filter({ hasText: "1 ligne(s) supprimée(s) avant le blocage" })
        .waitFor();
      assert.deepEqual(
        (await query("SELECT id FROM protected_parent"))[0].rows.map((r) =>
          String(r[0]),
        ),
        ["2"],
      );
      await noAlert();
      const sqlMemory = await page.evaluate(async () => {
        const { eng } = await import("/apps/studio/workbench/state.mjs");
        return eng().measure();
      });
      const sqlProcessMemory = await readBrowserProcessMemory();
      assert.ok(sqlMemory.raw.diagnostics.memoryAdviceWarnings > 0);
      assert.equal(
        logs.some((x) => x.includes("unsupported syscall: __syscall_madvise")),
        false,
      );
      await writeFile(
        `build-work/constraint-feedback/memory-${engine.name()}.json`,
        JSON.stringify(
          {
            scope:
              "WASM allocator/capacity and Linux aggregate browser PSS/RSS; one observational scenario, not a benchmark",
            phpProcessMemory,
            sqlProcessMemory,
            php: phpMemory,
            sql: sqlMemory,
          },
          null,
          2,
        ),
      );
      console.log(
        engine.name() +
          ": foreign-key edits/deletion, related navigation, explicit cascade configuration and runtime diagnostic handling passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
