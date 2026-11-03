import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import {
  chromium,
  firefox,
} from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
await mkdir("build-work/ux-revision", { recursive: true });
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      page.setDefaultTimeout(60000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const action = (name, ...args) =>
        page.evaluate(
          async ({ name, args }) => {
            const { A } = await import("/apps/studio/workbench/state.mjs");
            return A[name](...args);
          },
          { name, args },
        );
      const idle = () =>
        page.waitForFunction(
          () => document.querySelector("#app").dataset.lamp !== "busy",
        );
      const documentText = () =>
        page.evaluate(async () => {
          const { editorInstances } =
            await import("/apps/studio/workbench/ui.mjs");
          return editorInstances()
            .find((e) => e.kind === "editor")
            .model.view.state.doc.toString();
        });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      await page.locator("#pn").fill("revision");
      await page.locator("input[name=tpl][value=empty]").check();
      await page.locator("[data-act=create]").click();
      await page.locator("#ed1 .cm-content").waitFor();
      await page.evaluate(async () => {
        const { A, eng, sql } =
          await import("/apps/studio/workbench/state.mjs");
        await A.nav("data");
        await sql("CREATE TABLE items(id INT PRIMARY KEY)");
        await A.nav("schema");
        A.schemaSel("items");
      });
      await page
        .getByRole("button", { name: "Ajouter une colonne", exact: true })
        .click();
      await page.locator("#modal [data-f=name]").fill("titre");
      await page.locator("#column-size").fill("80");
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      assert.deepEqual(
        await page.evaluate(async () =>
          (await axe.run(document.querySelector("#modal"))).violations.map(
            (x) => x.id,
          ),
        ),
        [],
      );
      await page.setViewportSize({ width: 320, height: 800 });
      assert.equal(
        await page
          .locator("#modal")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
        true,
      );
      await page.screenshot({
        path: `build-work/ux-revision/column-mobile-${engine.name()}.png`,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({
        path: `build-work/ux-revision/column-${engine.name()}.png`,
      });
      await page.locator("#modal [data-v=ok]").click();
      await page.locator("#modal").waitFor({ state: "hidden" });
      assert.equal(
        await page.evaluate(async () => {
          const { S } = await import("/apps/studio/workbench/state.mjs");
          return S.cat.tables
            .find((t) => t.name === "items")
            .columns.some((c) => c.name === "titre");
        }),
        true,
      );
      await action("nav", "sessions");
      assert.equal(await page.locator("#alertHost").innerText(), "");
      // A real error banner must push the workspace below it, including sessions.
      await page.evaluate(async () => {
        const { S, ctx } = await import("/apps/studio/workbench/state.mjs");
        S.alert = { title: "Erreur de test", msg: "Message long à consulter" };
        ctx.draw();
      });
      const alert = await page.locator("#alertHost").boundingBox(),
        heading = await page.locator("#v-sessions h1").boundingBox();
      assert.ok(heading.y >= alert.y + alert.height);
      await page.screenshot({
        path: `build-work/ux-revision/sessions-${engine.name()}.png`,
      });
      await action("alertX");
      await page.evaluate(async () => {
        const { eng } = await import("/apps/studio/workbench/state.mjs");
        await eng().fs.write(
          "/page.html",
          "<section><p>Alpha alpha alphabet</p></section>",
        );
        await eng().fs.write(
          "/notes.md",
          "# Bonjour\n\n**Texte**\n\n<script>parent.hacked=1</script>",
        );
        await eng().fs.write("/job.php", '<?php echo "SORTIE_OK";');
        const { refreshFiles } =
          await import("/apps/studio/workbench/views/explorer.mjs");
        await refreshFiles();
      });
      await action("nav", "code");
      await action("openFile", "/page.html");
      // Replace only the opening tag via one real editor transaction.
      await page.evaluate(async () => {
        const { editorInstances } =
          await import("/apps/studio/workbench/ui.mjs");
        const v = editorInstances().find((e) => e.kind === "editor").model.view;
        v.dispatch({
          changes: { from: 1, to: 8, insert: "article" },
          userEvent: "input.type",
        });
      });
      assert.equal(
        await documentText(),
        "<article><p>Alpha alpha alphabet</p></article>",
      );
      await action("editorSearch");
      const search = page.locator(".alwis-search");
      const searchBox = await search.boundingBox(),
        editorBox = await page.locator("#ed1").boundingBox();
      assert.ok(searchBox.width < editorBox.width * 0.7);
      await search.locator("[name=search]").fill("alpha");
      await search
        .getByRole("button", { name: "Mot entier", exact: true })
        .click();
      await search
        .getByRole("button", { name: "Respecter la casse", exact: true })
        .click();
      await search
        .getByRole("button", { name: "Afficher le remplacement" })
        .click();
      await search.locator("[name=replace]").fill("beta");
      await search
        .getByRole("button", { name: "Tout remplacer", exact: true })
        .click();
      assert.match(await documentText(), /Alpha beta alphabet/);
      await search
        .getByRole("button", { name: "Expression régulière", exact: true })
        .click();
      await search.locator("[name=search]").fill("[");
      assert.equal(
        await search.locator("[name=search]").getAttribute("aria-invalid"),
        "true",
      );
      await page.setViewportSize({ width: 320, height: 800 });
      assert.equal(
        await search.evaluate((el) => el.scrollWidth <= el.clientWidth),
        true,
      );
      await page.screenshot({
        path: `build-work/ux-revision/search-mobile-${engine.name()}.png`,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({
        path: `build-work/ux-revision/search-${engine.name()}.png`,
      });
      await search.getByRole("button", { name: "Fermer la recherche" }).click();
      await page.locator("#ed1 .cm-content").click({ button: "right" });
      assert.equal(
        await page.getByRole("menuitem", { name: /Développer.*Emmet/ }).count(),
        1,
      );
      assert.equal(
        await page
          .getByRole("menuitem", { name: /Renommer le symbole/ })
          .count(),
        0,
      );
      await page.keyboard.press("Escape");
      await page.locator("#ed1 .cm-content").press("Shift+F10");
      await page.getByRole("menuitem",{name:/Développer.*Emmet/}).waitFor();
      await page.keyboard.press("Escape");
      await action("openFile", "/notes.md");
      await action("pvToggle");
      await page
        .frameLocator("#pvFrames iframe")
        .getByRole("heading", { name: "Bonjour" })
        .waitFor();
      assert.equal(await page.evaluate(() => window.hacked), undefined);
      await page.screenshot({
        path: `build-work/ux-revision/markdown-${engine.name()}.png`,
      });
      await action("openFile", "/job.php");
      await action("executePHP");
      await page
        .locator("#dockB pre")
        .filter({ hasText: "SORTIE_OK" })
        .waitFor();
      const close = await page.locator("[data-act=dockClose]").boundingBox();
      assert.ok(close.width >= 32 && close.height >= 32);
      const before = await page.evaluate(async () => {
        const { S } = await import("/apps/studio/workbench/state.mjs");
        return S.active;
      });
      await page.locator("#tabs").dispatchEvent("wheel", { deltaY: -80 });
      await idle();
      assert.notEqual(
        await page.evaluate(async () => {
          const { S } = await import("/apps/studio/workbench/state.mjs");
          return S.active;
        }),
        before,
      );
      await action("openFile", "/job.php");
      await page.evaluate(async () => {
        const { editorInstances } =
          await import("/apps/studio/workbench/ui.mjs");
        const v = editorInstances().find((e) => e.kind === "editor").model.view;
        v.dispatch({
          changes: {
            from: 0,
            to: v.state.doc.length,
            insert: '<?php header("Location: /")\nexit;',
          },
        });
      });
      await action("editorProblems");
      await page
        .locator(".cm-diagnostic")
        .filter({ hasText: "point-virgule" })
        .first()
        .waitFor();
      for (const theme of ["dark", "light"]) {
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        assert.deepEqual(
          await page.evaluate(async () =>
            (
              await axe.run(document.querySelector(".cm-panel-lint"))
            ).violations.map((v) => v.id),
          ),
          [],
        );
        await page.screenshot({
          path: `build-work/ux-revision/diagnostics-${theme}-${engine.name()}.png`,
        });
      }
      await page
        .getByRole("button", { name: "Ajouter ;", exact: true })
        .first()
        .click();
      await action("save");
      await action("close");
      // Delete only this test-created project and verify it cannot be reopened from recents.
      await page
        .getByRole("button", {
          name: "Supprimer le projet revision",
          exact: true,
        })
        .click();
      await page.locator("#modal [data-v=ok]").click();
      await page.waitForFunction(
        () => !document.querySelector("[data-act=open][data-arg=revision]"),
      );
      if (engine === chromium) {
        await page.evaluate(async () => {
          window.testFolder = await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle("local-test", { create: true });
          const f = await testFolder.getFileHandle("index.php", {
              create: true,
            }),
            w = await f.createWritable();
          await w.write('<?php echo "local";');
          await w.close();
          window.showDirectoryPicker = async () => testFolder;
        });
        await action("openLocalFolder");
        await action("nav", "data");
        await page.evaluate(async () => {
          const { sql, S } = await import("/apps/studio/workbench/state.mjs");
          await sql("CREATE TABLE saved_context (id INT PRIMARY KEY)");
          await sql("INSERT INTO saved_context VALUES (42)");
          S.qtext = "SELECT * FROM saved_context";
        });
        assert.equal(await action("save"), true);
        await action("close");
        await action("openLocalFolder");
        await action("nav", "data");
        assert.deepEqual(
          await page.evaluate(async () => {
            const { eng, S } = await import("/apps/studio/workbench/state.mjs");
            return {
              rows: (
                await eng().db.query("SELECT id FROM saved_context", S.db)
              )[0].rows.map((r) => String(r[0])),
              query: S.qtext,
            };
          }),
          { rows: ["42"], query: "SELECT * FROM saved_context" },
        );
        await page.evaluate(async () => {
          const { A } = await import("/apps/studio/workbench/state.mjs");
          void A.detachFolder();
        });
        await page.locator("#modal [data-v=ok]").click();
        await page.waitForFunction(
          async () =>
            !(await import("/apps/studio/workbench/state.mjs")).ctx.folder,
        );
        assert.equal(
          await page.evaluate(async () => {
            const d = await testFolder.getDirectoryHandle(".alwis");
            return (
              (await (await d.getFileHandle("context.json")).getFile()).size > 0
            );
          }),
          true,
        );
      }
      assert.deepEqual(errors, []);
      console.log(
        engine.name() +
          ": schema column, sessions layout, linked tags, fixed search, context menu, Markdown, PHP output, wheel, project deletion and folder context passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
