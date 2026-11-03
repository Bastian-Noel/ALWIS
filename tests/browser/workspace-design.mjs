/** Real workspace interactions: one save action, project switching, inline files,
 * full-table literal search and visual simple/composite foreign keys. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const output = resolve("build-work/workspace-design");
await mkdir(output, { recursive: true });
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
  ...(process.env.ALWIS_CHROMIUM_PATH
    ? { executablePath: process.env.ALWIS_CHROMIUM_PATH }
    : {}),
});
const checks = [],
  errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => errors.push(e.message));
  const idle = () =>
    page.waitForFunction(
      () => document.querySelector("#app").dataset.lamp !== "busy",
    );
  const action = (name, ...args) =>
    page.evaluate(
      async ({ name, args }) => {
        const { A } = await import("/apps/studio/workbench/state.mjs");
        return A[name](...args);
      },
      { name, args },
    );
  const state = () =>
    page.evaluate(async () => {
      const { S } = await import("/apps/studio/workbench/state.mjs");
      return {
        project: S.project,
        total: S.total,
        rows: S.grid?.rows,
        search: S.search,
        filter: S.filter,
        saved: S.savedAt,
        pending:
          S.applied.size + Object.keys(S.drafts).length + Number(S.dbDirty),
      };
    });
  async function audit(label) {
    await page.evaluate(() =>
      Promise.allSettled(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished),
      ),
    );
    const violations = await page.evaluate(async () =>
      (await axe.run(document)).violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    );
    assert.deepEqual(violations, [], label);
    checks.push("accessibility: " + label);
  }
  async function shot(name) {
    // Hide transient toast so captures document the interface, not a notification.
    await page.locator("#toast").evaluate((el) => el.classList.remove("on"));
    await page.screenshot({ path: resolve(output, name + ".png") });
  }
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
  await page.addScriptTag({
    path: resolve("node_modules/axe-core/axe.min.js"),
  });
  await page.locator("#pn").fill("campus");
  await page.locator("[data-act=create]").click();
  await page.locator("#ed1 .cm-content").waitFor();
  assert.equal(await page.locator(".top [data-act=importZip]").count(), 0);
  assert.match(
    await page.locator("#chip").getAttribute("aria-label"),
    /campus/,
  );
  assert.deepEqual(
    await page
      .locator("#codeTools button:visible")
      .evaluateAll((els) => els.map((e) => e.dataset.tool)),
    ["Formater", "Problèmes"],
  );
  assert.equal(await page.getByLabel("Indentation du code").isVisible(), false);
  await audit("editor");
  await shot("editor-light");
  await page.locator("#fileMenuBtn").click();
  assert.equal(
    await page
      .getByRole("menuitem", { name: "Indentation…", exact: true })
      .count(),
    1,
  );
  await page
    .getByRole("menuitem", { name: "Indentation…", exact: true })
    .click();
  await page.getByLabel("Indentation du code").selectOption("4");
  await page.getByLabel("Indentation du code").press("Escape");
  assert.equal(await page.getByLabel("Indentation du code").isVisible(), false);
  checks.push("secondary editor settings stay in menu");

  await page.locator("aside [data-act=newFile]").first().click();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.locator("#newEntryName").fill("pages/contact.php");
  await page.locator("#newEntryName").press("Enter");
  await page.locator("#crumb").filter({ hasText: "contact.php" }).waitFor();
  await page.locator("#ed1 .cm-content").fill('<?php echo "Bonjour";');
  await page.keyboard.press("Control+s");
  await idle();
  await page.waitForFunction(async () => {
    const { S } = await import("/apps/studio/workbench/state.mjs");
    return !!S.savedAt && !S.applied.size && !Object.keys(S.drafts).length;
  });
  assert.equal((await state()).pending, 0);
  checks.push("Ctrl+S saves file and project together");
  const [archive, simultaneous] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(async () => {
      const { A, ctx } = await import("/apps/studio/workbench/state.mjs");
      const original = ctx.engine.projects.save;
      let checkpoints = 0;
      ctx.engine.projects.save = async () => {
        checkpoints++;
        return original();
      };
      try {
        const first = A.save(),
          second = A.save();
        const sameOperation = first === second;
        const [saved] = await Promise.all([first, second, A.exportZip()]);
        return { sameOperation, saved, checkpoints };
      } finally {
        ctx.engine.projects.save = original;
      }
    }),
  ]);
  assert.ok(await archive.path());
  assert.deepEqual(simultaneous, {
    sameOperation: true,
    saved: true,
    checkpoints: 1,
  });
  checks.push(
    "simultaneous saves share one checkpoint and ZIP waits for restart",
  );
  await action("newFile", "/pages");
  await page.locator("#newEntryName").fill("contact.php");
  await page.locator("#newEntryName").press("Enter");
  await page
    .locator("#newEntryError")
    .filter({ hasText: "existe déjà" })
    .waitFor();
  assert.equal(
    await page.locator("#newEntryName").getAttribute("aria-invalid"),
    "true",
  );
  await page.locator("#newEntryName").press("Escape");
  assert.equal(await page.locator("#newEntryName").count(), 0);
  await action("newFolder", "/pages");
  await page.locator("#newEntryName").fill("informations");
  await shot("inline-file");
  await page.locator("#newEntryName").press("Enter");
  assert.equal(
    await page.locator('#tree [data-path="/pages/informations"]').count(),
    1,
  );
  checks.push(
    "inline creation, nested paths, duplicate protection and cancellation",
  );

  await page.locator("[data-act=nav][data-arg=data]").click();
  await idle();
  await page.locator("#tableSearch").fill("students");
  assert.equal(
    await page.locator("#dbtree .tb[data-act=selectTable]").count(),
    1,
  );
  await page.locator("#tableSearch").fill("");
  checks.push("table name search");
  await page.evaluate(async () => {
    const { sql } = await import("/apps/studio/workbench/state.mjs");
    await sql(
      "CREATE TABLE contacts (id INT PRIMARY KEY, nom VARCHAR(80) NOT NULL);",
    );
    const rows = Array.from(
      { length: 105 },
      (_, i) =>
        `(${i + 1},'${i === 0 ? "100% exact" : i === 1 ? "100_percent" : i === 2 ? "Alice" : i === 104 ? "Zoé Martin" : "Contact " + (i + 1)}')`,
    );
    await sql("INSERT INTO contacts VALUES " + rows.join(",") + ";");
    await sql(
      "CREATE TABLE inscriptions (id INT PRIMARY KEY, contact_id INT NOT NULL);",
    );
    await sql(
      "CREATE TABLE cles_composees (a INT NOT NULL,b INT NOT NULL,PRIMARY KEY(a,b));",
    );
    await sql(
      "CREATE TABLE liens_composes (id INT PRIMARY KEY,a INT NOT NULL,b INT NOT NULL);",
    );
    const { refreshDb } = await import("/apps/studio/workbench/views/data.mjs");
    await refreshDb();
  });
  await action("selectTable", "contacts");
  assert.equal((await state()).rows.length, 100);
  async function search(text) {
    await page.locator("#dataSearch").fill(text);
    await page.locator("#dataSearch").press("Enter");
    await idle();
  }
  await search("105");
  assert.equal((await state()).total, 1);
  assert.equal(String((await state()).rows[0][0]), "105");
  await search("%");
  assert.equal((await state()).total, 1);
  assert.equal((await state()).rows[0][1], "100% exact");
  await search("_");
  assert.equal((await state()).total, 1);
  await search("' OR 1=1 --");
  assert.equal((await state()).total, 0);
  await search("Martin");
  assert.equal((await state()).total, 1);
  await shot("data-search-light");
  await audit("data search");
  await page.locator(".data-filters summary").click();
  await page.locator("#fcol").selectOption("id");
  await page.locator("#fval").fill("1");
  await page.locator("[data-act=filterApply]").click();
  await idle();
  assert.equal((await state()).total, 0);
  await page.locator("[data-act=filterReset]").click();
  await idle();
  assert.equal((await state()).total, 1);
  assert.equal((await state()).search, "Martin");
  checks.push(
    "full-table search beyond page 1, literal % and _, SQL escaping and filter combination",
  );

  await action("selectTable", "inscriptions");
  await action("dmode", "struct");
  await page.locator("#dmain [data-act=relationForm]").click();
  await page.locator("#rel-parent").selectOption("contacts");
  await page.locator("[data-rel-column]").selectOption("contact_id");
  assert.equal(await page.locator("#modal [data-v=ok]").isEnabled(), true);
  assert.equal(await page.locator("#rel-sql").isVisible(), false);
  await page.locator(".relation-options summary").click();
  await page.locator("#rel-delete").selectOption("SET NULL");
  assert.equal(await page.locator("#modal [data-v=ok]").isDisabled(), true);
  await page.locator("#rel-delete").selectOption("RESTRICT");
  await page.locator(".relation-options summary").click();
  await audit("visual relationship");
  await shot("relation-light");
  await page.locator("#modal [data-v=ok]").click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(async () => {
      const { S } = await import("/apps/studio/workbench/state.mjs");
      return S.cat.tables
        .find((t) => t.name === "inscriptions")
        .fks.some((f) => f.refTable === "contacts");
    }),
    true,
  );
  await action("selectTable", "liens_composes");
  await action("dmode", "struct");
  await page.locator("#dmain [data-act=relationForm]").click();
  await page.locator("#rel-parent").selectOption("cles_composees");
  assert.equal(await page.locator("[data-rel-column]").count(), 2);
  await page.locator("[data-rel-column]").nth(0).selectOption("a");
  await page.locator("[data-rel-column]").nth(1).selectOption("a");
  assert.equal(await page.locator("#modal [data-v=ok]").isDisabled(), true);
  await page.locator("[data-rel-column]").nth(1).selectOption("b");
  await page.locator("#modal [data-v=ok]").click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  const fk = await page.evaluate(async () => {
    const { S } = await import("/apps/studio/workbench/state.mjs");
    return S.cat.tables.find((t) => t.name === "liens_composes").fks[0];
  });
  assert.deepEqual(fk.columns, ["a", "b"]);
  assert.deepEqual(fk.refColumns, ["a", "b"]);
  checks.push(
    "visual simple and composite relationships, invalid mapping blocked",
  );

  await action("save");
  await page.locator("#chip").click();
  await page
    .getByRole("menuitem", { name: "Tous les projets", exact: true })
    .click();
  await page.locator("#pn").fill("mon-site");
  await page.locator("input[value=empty]").check();
  await page.locator("[data-act=create]").click();
  await page.locator("#ed1 .cm-content").waitFor();
  await page.locator("#ed1 .cm-content").fill('<?php echo "À conserver";');
  await page.locator("#chip").click();
  await page.getByRole("menuitem", { name: "campus", exact: true }).click();
  await page.locator("#modal [data-v=no]").click();
  assert.equal((await state()).project, "mon-site");
  await page.locator("#chip").click();
  await page.getByRole("menuitem", { name: "campus", exact: true }).click();
  await page.locator("#modal [data-v=save]").click();
  await page.waitForFunction(
    () => document.querySelector("#pname").textContent === "campus",
  );
  await idle();
  await page.locator("#chip").click();
  await shot("project-switch");
  await page.getByRole("menuitem", { name: "mon-site", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#pname").textContent === "mon-site",
  );
  await page
    .locator("#ed1 .cm-content")
    .filter({ hasText: "À conserver" })
    .waitFor();
  checks.push(
    "project switch cancellation and save-before-switch preserve edits",
  );

  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    await audit("editor " + theme);
    await shot("saved-editor-" + theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await audit("mobile " + theme);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false, "mobile page overflow");
    await shot("mobile-" + theme);
    await page.setViewportSize({ width: 320, height: 844 });
    await audit("mobile 320 " + theme);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await shot("mobile-320-" + theme);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.keyboard.press("Alt");
  assert.equal(await page.locator("#shortcutHints").innerText(), "");
  await page.keyboard.down("Alt");
  await page.waitForFunction(
    () => document.querySelector("#shortcutHints").children.length > 0,
  );
  await page.keyboard.up("Alt");
  assert.equal(await page.locator("#shortcutHints").innerText(), "");
  checks.push(
    "short Alt press stays quiet; held Alt shows transient shortcuts",
  );
  assert.deepEqual(errors, [], "browser page errors");
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(
      {
        browser: await browser.version(),
        executable: process.env.ALWIS_CHROMIUM_PATH ?? "playwright",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} finally {
  await browser.close();
  server.close();
}
