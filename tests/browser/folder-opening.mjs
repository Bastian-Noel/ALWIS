import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import {
  chromium,
  firefox,
} from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
await mkdir("build-work/folder-opening", { recursive: true });
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch({
      headless: true,
      ...(engine === chromium ? { args: ["--no-sandbox"] } : {}),
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      page.setDefaultTimeout(60000);
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      await page.evaluate(() => {
        window.contentReads = 0;
        window.showDirectoryPicker = async () => ({
          name: "75-mio",
          async *entries() {
            for (let i = 0; i < 5; i++)
              yield [
                "part-" + i + ".bin",
                {
                  kind: "file",
                  getFile: async () => ({
                    size: 15 * 1048576,
                    arrayBuffer: async () => {
                      contentReads++;
                      throw Error("Must not read before selection");
                    },
                  }),
                },
              ];
          },
        });
      });
      await page.locator("[data-act=openLocalFolder]").click();
      await page
        .locator("#importIssue")
        .filter({ hasText: "64 Mio" })
        .waitFor();
      assert.equal(
        await page.locator("#modal [data-v=open]").isDisabled(),
        true,
      );
      assert.equal(await page.evaluate(() => contentReads), 0);
      await page.locator('input[data-path="/part-4.bin"]').uncheck();
      assert.equal(
        await page.locator("#modal [data-v=open]").isEnabled(),
        true,
      );
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        await page.locator("#modal").evaluate(
          async (el) =>
            await Promise.all(
              el
                .getAnimations({ subtree: true })
                .filter((a) =>
                  Number.isFinite(a.effect.getComputedTiming().endTime),
                )
                .map((a) => a.finished.catch(() => {})),
            ),
        );
        const issues = await page.evaluate(async () =>
          (await axe.run(document.querySelector("#modal"))).violations.map(
            (v) => ({ id: v.id, nodes: v.nodes.map((n) => n.failureSummary) }),
          ),
        );
        assert.deepEqual(issues, []);
        await page.screenshot({
          path: `build-work/folder-opening/selection-${theme}-${engine.name()}.png`,
        });
      }
      await page.locator("#modal [data-v=no]").click();
      assert.equal(
        await page.evaluate(async () => {
          const { S, eng } = await import("/apps/studio/workbench/state.mjs");
          return S.project === null && eng().projects.recents().length === 0;
        }),
        true,
      );
      if (engine === chromium) {
        await page.evaluate(async () => {
          window.folder = await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle("selection-real", { create: true });
          async function write(dir, name, value) {
            const h = await dir.getFileHandle(name, { create: true }),
              w = await h.createWritable();
            await w.write(value);
            await w.close();
          }
          await write(folder, "index.php", '<?php echo "local";');
          await write(folder, "backup.zip", new Uint8Array(20 * 1048576));
          await write(
            folder,
            "asset.dat",
            new Uint8Array(10 * 1048576).fill(3),
          );
          const vendor = await folder.getDirectoryHandle("vendor", {
            create: true,
          });
          await write(vendor, "autoload.php", "<?php return true;");
          window.showDirectoryPicker = async () => folder;
        });
        await page.locator("[data-act=openLocalFolder]").click();
        await page.locator('input[data-path="/backup.zip"]').waitFor();
        assert.equal(
          await page.locator('input[data-path="/backup.zip"]').isChecked(),
          false,
        );
        assert.equal(
          await page.locator('input[data-path="/backup.zip"]').isDisabled(),
          true,
        );
        assert.equal(
          await page.locator('input[data-path="/vendor"]').isChecked(),
          false,
        );
        await page.locator("#modal [data-v=open]").click();
        await page
          .locator("#ed1 .cm-content")
          .filter({ hasText: "local" })
          .waitFor();
        const action = (name, ...args) =>
          page.evaluate(
            async ({ name, args }) => {
              const { A } = await import("/apps/studio/workbench/state.mjs");
              return A[name](...args);
            },
            { name, args },
          );
        await page.locator("#ed1 .cm-content").fill('<?php echo "saved";');
        assert.equal(await action("save"), true);
        assert.equal(
          await page.evaluate(
            async () =>
              (await (await folder.getFileHandle("backup.zip")).getFile()).size,
          ),
          20 * 1048576,
        );
        await page.evaluate(async () => {
          const { S } = await import("/apps/studio/workbench/state.mjs");
          S.qtext = "SELECT 42;";
        });
        assert.equal(await action("save"), true);
        await action("close");
        await page.locator("[data-act=openLocalFolder]").click();
        await page.locator("#modal [data-v=open]").click();
        await page
          .locator("#ed1 .cm-content")
          .filter({ hasText: "saved" })
          .waitFor();
        assert.equal(
          await page.evaluate(
            async () =>
              (await import("/apps/studio/workbench/state.mjs")).S.qtext,
          ),
          "SELECT 42;",
        );
        assert.equal(await action("save"), true);
        await action("close");
        // Explicit inclusion is a two-stage metadata scan, not a silent dependency drop.
        await page.locator("[data-act=openLocalFolder]").click();
        await page.locator('input[data-path="/vendor"]').check();
        await page
          .getByRole("button", {
            name: "Analyser les dossiers choisis",
            exact: true,
          })
          .click();
        await page.locator('input[data-path="/vendor/autoload.php"]').waitFor();
        assert.equal(
          await page
            .locator('input[data-path="/vendor/autoload.php"]')
            .isChecked(),
          true,
        );
        await page.locator("#modal [data-v=no]").click();
      }
      await page.evaluate(() => {
        window.showDirectoryPicker = async () => {
          throw Error("Lecture du dossier interrompue");
        };
      });
      await page.locator("[data-act=openLocalFolder]").click();
      await page
        .locator(".toast-item[data-kind=error]")
        .filter({ hasText: "Lecture du dossier interrompue" })
        .waitFor();
      console.log(
        engine.name(),
        "folder selective import, budgets, cancellation, errors and dependency inclusion passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
