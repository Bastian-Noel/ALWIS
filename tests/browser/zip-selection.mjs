import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
  chromium,
  firefox,
} from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
await mkdir("build-work/zip-selection", { recursive: true });
execFileSync("python3", [
  "-c",
  `import zipfile
with zipfile.ZipFile('build-work/zip-selection/source.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('project/index.php','<?php echo "selected";')
 z.writestr('project/node_modules/pkg/a.js','not selected')
 z.writestr('project/vendor/autoload.php','<?php return true;')
 z.writestr('project/backup.zip',bytes(20*1048576))
 z.writestr('project/media.dat',b'a'*(10*1048576))
 for i in range(1100): z.writestr('project/node_modules/pkg/f'+str(i),'x')`,
]);
await writeFile("build-work/zip-selection/broken.zip", "not a zip");
execFileSync("python3", [
  "-c",
  `import zipfile
with zipfile.ZipFile('build-work/zip-selection/bad-backup.zip','w') as z:
 z.writestr('.pbl-backup/project.json','{}')
 z.writestr('index.php','<?php echo 42;')`,
]);
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch({
      headless: true,
      ...(engine === chromium ? { args: ["--no-sandbox"] } : {}),
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1400, height: 900 },
      });
      page.setDefaultTimeout(60000);
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page
        .locator("#zipIn")
        .setInputFiles("build-work/zip-selection/source.zip");
      await page.locator("#modal [data-v=open]").waitFor();
      assert.equal(
        await page.locator("#modal [data-v=open]").isEnabled(),
        true,
      );
      assert.match(
        await page.locator("#importBudget").innerText(),
        /^2 fichier/,
      );
      await page.locator("#modal [data-v=no]").click();
      assert.equal(
        await page.evaluate(
          async () =>
            (await import("/apps/studio/workbench/state.mjs")).S.project,
        ),
        null,
      );
      await page
        .locator("#zipIn")
        .setInputFiles("build-work/zip-selection/source.zip");
      await page.locator("#importFilter").fill("backup.zip");
      assert.equal(
        await page.locator('input[data-path="/backup.zip"]').isChecked(),
        false,
      );
      assert.equal(
        await page.locator('input[data-path="/backup.zip"]').isDisabled(),
        true,
      );
      await page.locator("#modal [data-v=open]").click();
      await page
        .locator("#ed1 .cm-content")
        .filter({ hasText: "selected" })
        .waitFor();
      const paths = await page.evaluate(async () => {
        const { S } = await import("/apps/studio/workbench/state.mjs");
        return S.files.map((f) => f.path);
      });
      assert.deepEqual(paths, ["/index.php", "/media.dat"]);
      assert.equal(
        await page.evaluate(async () => {
          const { S } = await import("/apps/studio/workbench/state.mjs");
          return S.files.find((f) => f.path === "/media.dat").size;
        }),
        10 * 1048576,
      );
      await page.evaluate(async () => {
        const { A, S } = await import("/apps/studio/workbench/state.mjs");
        S.applied.clear();
        S.dbDirty = false;
        await A.close();
      });
      await page
        .locator("#zipIn")
        .setInputFiles("build-work/zip-selection/broken.zip");
      await page
        .getByRole("heading", { name: "ZIP non ouvert", exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(
          async () =>
            (await import("/apps/studio/workbench/state.mjs")).S.project,
        ),
        null,
      );
      await page.locator("#modal [data-v=no]").click();
      const before = await page.evaluate(
        async () =>
          (await import("/apps/studio/workbench/state.mjs"))
            .eng()
            .projects.recents().length,
      );
      await page
        .locator("#zipIn")
        .setInputFiles("build-work/zip-selection/bad-backup.zip");
      await page.locator("#modal [data-v=open]").click();
      await page
        .getByRole("heading", { name: "ZIP non ouvert", exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(
          async () =>
            (await import("/apps/studio/workbench/state.mjs")).S.project,
        ),
        null,
      );
      assert.equal(
        await page.evaluate(
          async () =>
            (await import("/apps/studio/workbench/state.mjs"))
              .eng()
              .projects.recents().length,
        ),
        before,
      );
      console.log(
        engine.name(),
        "ZIP metadata selection, dependencies, oversized file, cancellation and invalid archive passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
