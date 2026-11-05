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
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      await page.evaluate(() => {
        window.contentReads = 0;
        window.pickerCalls = 0;
        window.showDirectoryPicker = async () => {
          pickerCalls++;
          return {
            name: "Trop volumineux",
            getDirectoryHandle: async () => {
              throw new DOMException("Absent", "NotFoundError");
            },
            async *entries() {
              yield [
                "backup.zip",
                {
                  kind: "file",
                  getFile: async () => ({
                    size: 17 * 1048576,
                    arrayBuffer: async () => {
                      contentReads++;
                      throw Error("Must not read contents");
                    },
                  }),
                },
              ];
            },
          };
        };
      });
      await page.locator("[data-act=openLocalFolder]").click();
      await page
        .getByRole("heading", { name: "Dossier non ouvert", exact: true })
        .waitFor();
      assert.match(
        await page.locator("#modal [role=alert]").textContent(),
        /backup.zip.*17 Mio.*16 Mio/,
      );
      assert.equal(
        await page.evaluate(async () => {
          const { S, eng } = await import("/apps/studio/workbench/state.mjs");
          return (
            S.project === null &&
            eng().projects.recents().length === 0 &&
            contentReads === 0
          );
        }),
        true,
      );
      assert.equal(
        await page.locator(".toast-item[data-kind=success]").count(),
        0,
      );
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        await page.locator("#modal").evaluate(async (dialog) => {
          await Promise.all(
            dialog
              .getAnimations({ subtree: true })
              .filter((animation) =>
                Number.isFinite(animation.effect.getComputedTiming().endTime),
              )
              .map((animation) => animation.finished.catch(() => {})),
          );
        });
        assert.deepEqual(
          await page.evaluate(async () =>
            (await axe.run(document.querySelector("#modal"))).violations.map(
              (v) => ({
                id: v.id,
                nodes: v.nodes.map((n) => ({
                  html: n.html,
                  summary: n.failureSummary,
                })),
              }),
            ),
          ),
          [],
        );
        await page.screenshot({
          path: `build-work/folder-opening/limit-${theme}-${engine.name()}.png`,
          animations: "disabled",
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page
          .locator("#modal")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
        true,
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
      if (engine === chromium) {
        await page.evaluate(async () => {
          window.validFolder = await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle("local-project", { create: true });
          const handle = await validFolder.getFileHandle("index.php", {
              create: true,
            }),
            writer = await handle.createWritable();
          await writer.write('<?php echo "Dossier prêt";');
          await writer.close();
          window.showDirectoryPicker = async () => {
            pickerCalls++;
            return validFolder;
          };
        });
        await page
          .getByRole("button", {
            name: "Choisir un autre dossier",
            exact: true,
          })
          .click();
        await page
          .locator(".project-caption")
          .filter({ hasText: "dossier PC" })
          .waitFor();
        assert.match(
          await page.locator("#ed1 .cm-content").textContent(),
          /Dossier prêt/,
        );
        assert.equal(await page.evaluate(() => pickerCalls), 2);
        await page.evaluate(async () => {
          const { S } = await import("/apps/studio/workbench/state.mjs");
          S.qtext = "SELECT 42;";
        });
        assert.equal(await action("save"), true);
        await action("close");
        await page.locator("[data-act=openLocalFolder]").click();
        await page
          .locator(".project-caption")
          .filter({ hasText: "dossier PC" })
          .waitFor();
        assert.equal(
          await page.evaluate(async () => {
            const { S } = await import("/apps/studio/workbench/state.mjs");
            return S.qtext;
          }),
          "SELECT 42;",
        );
        assert.equal(await action("save"), true);
        await action("close");
      } else
        await page
          .getByRole("button", { name: "Fermer", exact: true })
          .last()
          .click();
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
      assert.equal(
        await page
          .locator(".toast-item[data-kind=error] .toast-title")
          .textContent(),
        "Dossier non ouvert",
      );
      assert.deepEqual(errors, []);
      console.log(
        engine.name() +
          ": explicit folder-limit failure, no partial project, accessible dialog and error notification passed" +
          (engine === chromium
            ? "; retry opens project and .alwis restores context"
            : ""),
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
