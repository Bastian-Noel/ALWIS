/** Real IDE journeys: mixed completion, FK drag/drop, DDL, cardinalities and project ZIP restore. */
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
const origin = "http://127.0.0.1:" + server.address().port,
  output = resolve(root, "apps/studio/receipts/ide");
await mkdir(output, { recursive: true });
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
      await page.goto(origin);
      await page
        .locator("#status")
        .filter({ hasText: "Prêt à ouvrir" })
        .waitFor();
      assert.equal(await page.locator("#panel-home").isVisible(), true);
      await page.screenshot({ path: resolve(output, name + "-home.png") });
      const project = "ide-" + crypto.randomUUID();
      await page.locator("#project").fill(project);
      await page.locator("#open").click();
      await page
        .locator("#status")
        .filter({ hasText: "Projet prêt." })
        .waitFor();
      assert.match(
        await page.locator("#engine-state").textContent(),
        /à la demande/,
      );
      const code = page.locator("#editor-tool .source"),
        content = code.locator(".cm-content");
      await content.fill("<sec");
      await content.focus();
      await page.keyboard.press("Control+End");
      await page.keyboard.press("Control+Space");
      await page.locator(".cm-tooltip-autocomplete li").first().waitFor();
      await page.keyboard.press("Enter");
      assert.match(
        await code.evaluate((e) => e.value),
        /^<sec\n/,
        "Enter must insert a newline without accepting a completion",
      );
      await content.fill("<sec");
      await page.keyboard.press("Control+End");
      await page.keyboard.press("Control+Space");
      await page.locator(".cm-tooltip-autocomplete li").first().waitFor();
      await page.keyboard.press("Tab");
      assert.match(
        await code.evaluate((e) => e.value),
        /section/,
        "Tab accepts completion",
      );
      await page.keyboard.press("Escape");
      await content.fill("");
      await content.focus();
      await page.keyboard.type("<section>");
      assert.equal(await code.evaluate((e) => e.value), "<section></section>");
      await page.keyboard.press("Enter");
      assert.match(
        await code.evaluate((e) => e.value),
        /<section>\n\s+\n<\/section>/,
      );
      const mixed =
        '<main>\n<script>\n$("button").\n</script>\n<?php $pdo = new PDO("mysql:"); $pdo->\n?><section></section>';
      await content.fill(mixed);
      const jsPos = mixed.indexOf('$("button").') + '$("button").'.length;
      const regions = await code.evaluate(
        (e, { jsPos, mixed }) => [
          e.codeEditor.getLanguageAt(jsPos),
          e.codeEditor.getLanguageAt(mixed.indexOf("$pdo->") + 6),
          e.codeEditor.getLanguageAt(mixed.indexOf("section") + 3),
        ],
        { jsPos, mixed },
      );
      assert.deepEqual(regions, ["js", "php", "html"]);
      await code.evaluate((e, pos) => {
        e.codeEditor.view.dispatch({ selection: { anchor: pos } });
        e.codeEditor.view.focus();
      }, jsPos);
      await page.keyboard.press("Control+Space");
      await page
        .locator(".cm-tooltip-autocomplete li")
        .filter({ hasText: "addClass" })
        .waitFor();
      await page.keyboard.press("Escape");
      await content.fill('<?php echo "archive-ok";');
      await page.locator("#editor-tool .write").click();
      await page
        .locator("#editor-tool .message")
        .filter({ hasText: "Fichier écrit" })
        .waitFor();
      const bounds = await page.locator(".editor-explorer").boundingBox(),
        editBounds = await content.boundingBox();
      assert.ok(bounds.x > editBounds.x);
      await page.screenshot({ path: resolve(output, name + "-code.png") });
      await page.locator("#tab-sql").click();
      const query = page.locator("#sql-tool .query .cm-content");
      const sql = async (text) => {
        await page.locator(".sql-tab-query").click();
        await query.fill(text);
        await page.locator("#sql-tool .run").click();
        await page.waitForFunction(
          () =>
            document.querySelector("#activity").textContent === "Disponible",
        );
        if (await page.locator("#status[data-error]").count())
          throw Error(await page.locator("#status").textContent());
      };
      await sql(
        "CREATE TABLE authors(id INT PRIMARY KEY, name VARCHAR(30)); INSERT INTO authors VALUES(1,'Alice'),(2,'Bob'); CREATE TABLE books(id INT PRIMARY KEY, author_id INT NOT NULL); CREATE TABLE tags(id INT PRIMARY KEY);",
      );
      await page.locator('.database-tree button[data-table="authors"]').click();
      await page
        .locator("#sql-tool .grid td")
        .filter({ hasText: "Alice" })
        .waitFor();
      await page.locator(".data-filter summary").click();
      await page.locator(".filter-column").selectOption("name");
      await page.locator(".filter-value").fill("Bob");
      await page.locator(".filter-apply").click();
      await page
        .locator("#sql-tool .grid td")
        .filter({ hasText: "Bob" })
        .waitFor();
      await page.waitForFunction(
        () =>
          document.querySelectorAll("#sql-tool .grid tbody tr").length === 1,
      );
      assert.equal(await page.locator("#sql-tool .grid tbody tr").count(), 1);
      await page.locator(".filter-reset").click();
      await page.locator("#sql-tool .structure").click();
      await page.locator(".structure-grid th").first().waitFor();
      await page.locator(".sql-actions summary").click();
      await page.locator(".manage-table").click();
      const ddl = page.locator("#sql-tool .ddl-dialog");
      await ddl
        .getByText("Colonne / nouveau nom / index", { exact: false })
        .locator("input")
        .fill("active");
      await ddl
        .getByText("Type SQL", { exact: false })
        .locator("input")
        .fill("BOOLEAN");
      await ddl.getByRole("button", { name: "Appliquer", exact: true }).click();
      await ddl.waitFor({ state: "hidden" });
      await page.screenshot({ path: resolve(output, name + "-sql.png") });
      await page.locator("#tab-schema").click();
      await page.locator('.schema-table[data-table="books"]').waitFor();
      const parent = page.locator(
          '.column-port[data-table="authors"][data-column="id"]',
        ),
        child = page.locator(
          '.column-port[data-table="books"][data-column="author_id"]',
        );
      await parent.dragTo(child);
      const relation = page.locator(".relation-dialog");
      await relation.waitFor();
      assert.equal(
        await relation
          .getByLabel("Table parente", { exact: true })
          .inputValue(),
        "authors",
      );
      assert.equal(
        await relation.getByLabel("Table enfant", { exact: true }).inputValue(),
        "books",
      );
      await relation
        .getByRole("button", { name: "Créer la relation", exact: true })
        .click();
      await relation.waitFor({ state: "hidden" });
      await page.locator(".cardinality").filter({ hasText: "0..N" }).waitFor();
      assert.ok(
        (await page.locator(".cardinality").allTextContents()).includes("1"),
      );
      await page.locator(".relation-list summary").click();
      await page
        .locator(".relation-row")
        .filter({ hasText: "books (author_id)" })
        .getByRole("button", { name: "Modifier", exact: true })
        .click();
      await relation
        .getByLabel("Type de relation", { exact: true })
        .selectOption("one");
      await relation
        .getByRole("button", { name: "Créer la relation", exact: true })
        .click();
      await relation.waitFor({ state: "hidden" });
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".relation-row")].some((r) =>
          r.textContent.includes("books (author_id) [0..1]"),
        ),
      );
      await page.locator(".junction").click();
      await relation
        .getByLabel("Table enfant", { exact: true })
        .selectOption("books");
      await relation
        .getByLabel("Table parente", { exact: true })
        .selectOption("tags");
      await relation
        .getByLabel("Nom de la table de liaison", { exact: true })
        .fill("book_tags");
      await relation
        .getByRole("button", { name: "Créer la relation", exact: true })
        .click();
      await relation.waitFor({ state: "hidden" });
      await page.locator('.schema-table[data-table="book_tags"]').waitFor();
      assert.match(
        await page.locator(".junction-note").textContent(),
        /books N–N tags/,
      );
      const boxes = await page.locator(".schema-table").evaluateAll((cards) =>
        cards.map((c) => {
          const r = c.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }),
      );
      for (let a = 0; a < boxes.length; a++)
        for (let b = a + 1; b < boxes.length; b++)
          assert.ok(
            !(
              boxes[a].left < boxes[b].right &&
              boxes[a].right > boxes[b].left &&
              boxes[a].top < boxes[b].bottom &&
              boxes[a].bottom > boxes[b].top
            ),
            "new tables overlap",
          );
      await page.screenshot({ path: resolve(output, name + "-schema.png") });
      await page.locator("#tab-sql").click();
      await sql(
        "CREATE TABLE accounts(region INT NOT NULL, number INT NOT NULL, PRIMARY KEY(region,number)); CREATE TABLE invoices(id INT PRIMARY KEY, region INT NULL, account_number INT NULL)",
      );
      await page.locator("#tab-schema").click();
      await page.locator('.schema-table[data-table="invoices"]').waitFor();
      await page.locator(".new-relation").click();
      await relation
        .getByLabel("Table enfant", { exact: true })
        .selectOption("invoices");
      await relation
        .getByLabel("Colonne enfant", { exact: true })
        .selectOption(["region", "account_number"]);
      await relation
        .getByLabel("Table parente", { exact: true })
        .selectOption("accounts");
      await relation
        .getByLabel("Clé parente", { exact: true })
        .selectOption({ label: "region + number" });
      await relation
        .getByRole("button", { name: "Créer la relation", exact: true })
        .click();
      await relation.waitFor({ state: "hidden" });
      await page.waitForFunction(() =>
        document
          .querySelector(".relations-text")
          .textContent.includes("invoices (region, account_number) [0..N]"),
      );

      await page.locator("#tab-clients").click();
      const opening = page.waitForEvent("popup");
      await page.locator("#window").click();
      const client = await opening;
      await client.locator("body").filter({ hasText: "archive-ok" }).waitFor();
      assert.equal(await page.locator(".client-window").count(), 1);
      await page
        .locator(".client-window button")
        .filter({ hasText: "Fermer" })
        .click();
      await page.screenshot({ path: resolve(output, name + "-clients.png") });
      const downloading = page.waitForEvent("download");
      await page.locator(".project-menu summary").click();
      await page.locator("#export").click();
      const download = await downloading,
        zip = await readFile(await download.path());
      assert.ok(zip.byteLength > 0);
      await page.locator(".project-menu summary").click();
      await page.locator("#close").click();
      await page
        .locator("#status")
        .filter({ hasText: "Projet fermé" })
        .waitFor();
      assert.match(
        await page.locator("#project-list").textContent(),
        new RegExp(project),
      );
      await page.locator("#project").fill(project + "-copy");
      await page.locator("#home-zip").setInputFiles({
        name: "project.zip",
        mimeType: "application/zip",
        buffer: zip,
      });
      await page
        .locator("#status")
        .filter({ hasText: "Projet ZIP importé." })
        .waitFor();
      await page.locator("#tab-sql").click();
      await sql("SELECT name FROM authors ORDER BY id");
      assert.deepEqual(
        await page.locator("#sql-tool .grid tbody td").allTextContents(),
        ["Alice", "Bob"],
      );
      for (const width of [320, 768, 1500]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        for (const panel of ["home", "editor", "sql", "schema", "clients"]) {
          await page.locator("#tab-" + panel).click();
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            panel +
              " overflows at " +
              width +
              " " +
              JSON.stringify(
                await page.evaluate(() =>
                  [...document.querySelectorAll("body *")]
                    .filter(
                      (e) =>
                        e.getBoundingClientRect().width &&
                        e.getBoundingClientRect().right > innerWidth + 1,
                    )
                    .slice(0, 12)
                    .map((e) => ({
                      tag: e.tagName,
                      id: e.id,
                      cls: e.className,
                      right: e.getBoundingClientRect().right,
                      width: e.getBoundingClientRect().width,
                    })),
                ),
              ),
          );
        }
      }
      assert.deepEqual(errors, []);
      await writeFile(
        resolve(output, name + ".json"),
        JSON.stringify(
          {
            passed: true,
            browser: name,
            version: browser.version(),
            project,
            checks: [
              "project welcome and recents",
              "SQL remains lazy before SQL tab",
              "right explorer",
              "Enter newline and Tab acceptance",
              "HTML close tags and indentation",
              "PHP/JS/HTML region detection",
              "jQuery completion inside PHP script region",
              "live database/table tree",
              "filter/sort and structure form",
              "real FK drag and SQL application",
              "cardinalities from actual keys",
              "many-to-many junction creation",
              "one-to-one relation update and compound foreign key form",
              "new tables do not overlap existing positions",
              "visual clients",
              "worker compressed project ZIP with SQL roundtrip",
              "320/768/1500 no page overflow",
            ],
            pageErrors: errors,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(name, "IDE workspace passed");
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
