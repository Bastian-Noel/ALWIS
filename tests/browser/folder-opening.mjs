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
      const noProject = async () =>
        assert.equal(
          await page.evaluate(async () => {
            const { S, eng } = await import("/apps/studio/workbench/state.mjs");
            return S.project === null && eng().projects.recents().length === 0;
          }),
          true,
        );
      const auditDialog = async (prefix) => {
        for (const theme of ["light", "dark"]) {
          await page.evaluate(
            (t) => (document.documentElement.dataset.theme = t),
            theme,
          );
          await page.locator("#modal").evaluate(
            async (dialog) =>
              await Promise.all(
                dialog
                  .getAnimations({ subtree: true })
                  .filter((a) =>
                    Number.isFinite(a.effect.getComputedTiming().endTime),
                  )
                  .map((a) => a.finished.catch(() => {})),
              ),
          );
          assert.deepEqual(
            await page.evaluate(async () =>
              (await axe.run(document.querySelector("#modal"))).violations.map(
                (v) => ({
                  id: v.id,
                  nodes: v.nodes.map((n) => n.failureSummary),
                }),
              ),
            ),
            [],
          );
          await page.screenshot({
            path: `build-work/folder-opening/${prefix}-${theme}-${engine.name()}.png`,
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
      };
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      await page.evaluate(() => {
        window.contentReads = 0;
        window.pickerCalls = 0;
        window.showDirectoryPicker = async () => {
          pickerCalls++;
          return {
            name: "Total trop important",
            getDirectoryHandle: async () => {
              throw new DOMException("Absent", "NotFoundError");
            },
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
        /75 Mio.*64 Mio.*part-4.bin/,
      );
      await noProject();
      assert.equal(await page.evaluate(() => contentReads), 0);
      assert.equal(
        await page.locator(".toast-item[data-kind=success]").count(),
        0,
      );
      await auditDialog("limit");
      if (engine === chromium) {
        await page.evaluate(async () => {
          window.validFolder = await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle("local-project", { create: true });
          const index = await validFolder.getFileHandle("index.php", {
              create: true,
            }),
            writer = await index.createWritable();
          await writer.write('<?php echo "Dossier prêt";');
          await writer.close();
          for (const [name, size] of [
            ["backup.zip", 17 * 1048576],
            ["video.bin", 30 * 1048576],
          ]) {
            const file = await validFolder.getFileHandle(name, {
                create: true,
              }),
              stream = await file.createWritable();
            await stream.truncate(size);
            await stream.close();
          }
          window.showDirectoryPicker = async () => {
            pickerCalls++;
            return validFolder;
          };
        });
      } else {
        await page.evaluate(() => {
          window.showDirectoryPicker = async () => ({
            name: "Avec archive",
            getDirectoryHandle: async () => {
              throw new DOMException("Absent", "NotFoundError");
            },
            async *entries() {
              yield [
                "backup.zip",
                {
                  kind: "file",
                  getFile: async () => ({
                    size: 20 * 1048576,
                    arrayBuffer: async () => {
                      contentReads++;
                      throw Error("Must not read contents");
                    },
                  }),
                },
              ];
            },
          });
        });
      }
      await page
        .getByRole("button", { name: "Choisir un autre dossier", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Fichiers trop volumineux", exact: true })
        .waitFor();
      assert.match(
        await page.locator(".folder-exclusions").textContent(),
        /backup.zip/,
      );
      await noProject();
      assert.equal(await page.evaluate(() => contentReads), 0);
      assert.match(
        await page.locator(".folder-failure").textContent(),
        engine === chromium ? /2 fichiers dépassent/ : /1 fichier dépasse/,
      );
      assert.doesNotMatch(
        await page.locator(".folder-failure").textContent(),
        /undefined/,
      );
      await auditDialog("excluded");
      await page.locator("#modal [data-v=no]").click();
      await noProject();
      if (engine === chromium) {
        await page.locator("[data-act=openLocalFolder]").click();
        await page
          .getByRole("button", {
            name: "Ouvrir sans ces fichiers",
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
        assert.deepEqual(
          await page.evaluate(async () => {
            const { S } = await import("/apps/studio/workbench/state.mjs");
            return S.files.map((f) => f.path);
          }),
          ["/index.php"],
        );
        assert.equal(await page.evaluate(() => pickerCalls), 3);
        await page.evaluate(async () => {
          const { S } = await import("/apps/studio/workbench/state.mjs");
          S.qtext = "SELECT 42;";
        });
        assert.equal(await action("save"), true);
        const sizes = await page.evaluate(async () =>
          Promise.all(
            ["backup.zip", "video.bin"].map(
              async (n) =>
                (await (await validFolder.getFileHandle(n)).getFile()).size,
            ),
          ),
        );
        assert.deepEqual(
          sizes,
          [17 * 1048576, 30 * 1048576],
          "saving must leave excluded files on the PC untouched",
        );
        await action("close");
        await page.locator("[data-act=openLocalFolder]").click();
        await page
          .getByRole("button", {
            name: "Ouvrir sans ces fichiers",
            exact: true,
          })
          .click();
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
      assert.equal(
        await page
          .locator(".toast-item[data-kind=error] .toast-title")
          .textContent(),
        "Dossier non ouvert",
      );
      assert.deepEqual(errors, []);
      console.log(
        engine.name() +
          ": folder budgets, accessible exclusion preview, cancellation and errors passed" +
          (engine === chromium
            ? "; accepted files open, .alwis restores, and excluded files remain unchanged"
            : ""),
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
