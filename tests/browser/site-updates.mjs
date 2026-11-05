import assert from "node:assert/strict";
import {
  mkdtemp,
  cp,
  readFile,
  writeFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createSiteServer } from "../../scripts/serve-site-package.mjs";
const pw = await import(
  pathToFileURL(resolve("build-work/php/node_modules/playwright/index.mjs"))
    .href
);
const reports = [];
for (const name of ["chromium", "firefox"]) {
  const root = await mkdtemp(join(tmpdir(), "alwis-update-"));
  await cp("build-work/site", root, { recursive: true });
  const old = JSON.parse(await readFile(join(root, "release.json"), "utf8"));
  const next = {
    ...old,
    revision: "f".repeat(40),
    version: "0.3.0-preview.99",
    assetBase: "/_alwis/" + "f".repeat(40),
  };
  const server = createSiteServer(root);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await pw[name].launch({
    headless: true,
    ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}),
  });
  try {
    const context = await browser.newContext(),
      page = await context.newPage();
    page.setDefaultTimeout(60000);
    const origin = "http://127.0.0.1:" + server.address().port;
    await page.goto(origin);
    await page
      .locator("#siteVersion")
      .filter({ hasText: old.revision.slice(0, 7) })
      .waitFor();
    await page.locator("#pn").fill("update-preserve");
    await page.locator("input[name=tpl][value=empty]").check();
    await page.locator("[data-act=create]").click();
    await page.locator("#ed1 .cm-content").waitFor();
    await page
      .locator("#ed1 .cm-content")
      .fill('<?php echo "UNAPPLIED DRAFT";');
    await cp(
      join(root, old.assetBase.slice(1)),
      join(root, next.assetBase.slice(1)),
      { recursive: true },
    );
    async function rewrite(dir) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await rewrite(path);
        else if (/\.(html|mjs|js|css)$/.test(entry.name)) {
          const text = await readFile(path, "utf8");
          await writeFile(
            path,
            text
              .replaceAll(old.revision, next.revision)
              .replaceAll(old.version, next.version),
          );
        }
      }
    }
    await rewrite(join(root, next.assetBase.slice(1)));
    for (const file of ["index.html", "service-worker.js"]) {
      const text = await readFile(join(root, file), "utf8");
      await writeFile(
        join(root, file),
        text
          .replaceAll(old.revision, next.revision)
          .replaceAll(old.version, next.version),
      );
    }
    await writeFile(join(root, "release.json"), JSON.stringify(next));
    const completeIndex = await readFile(join(root, "index.html"), "utf8");
    const staleIndex = completeIndex
      .replaceAll(next.revision, old.revision)
      .replaceAll(next.version, old.version);
    await writeFile(join(root, "index.html"), staleIndex);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.locator("#siteUpdate[data-available=true]").waitFor();
    await page.locator("#siteUpdate").click();
    await page
      .locator(".site-update-error")
      .filter({ hasText: "pas complète" })
      .waitFor();
    assert.equal(
      await page.locator("#ed1").evaluate((el) => el.value),
      '<?php echo "UNAPPLIED DRAFT";',
    );
    assert.equal(await page.locator("#app").evaluate((el) => el.inert), false);
    await writeFile(join(root, "index.html"), completeIndex);
    await page.locator("#siteUpdate").click();
    await page.waitForURL(
      (url) => url.searchParams.get("build") === next.revision,
    );
    await page
      .locator("#siteVersion")
      .filter({ hasText: next.version })
      .waitFor();
    await page.locator("#siteUpdate").click();
    await page
      .locator("#siteUpdate")
      .filter({ hasText: "Recharger cette version" })
      .waitFor();
    const oldURL = page.url();
    await page.locator("#siteUpdate").click();
    await page.waitForURL(
      (url) =>
        url.href !== oldURL && url.searchParams.get("build") === next.revision,
    );
    await page
      .locator("#siteVersion")
      .filter({ hasText: next.version })
      .waitFor();
    await page.evaluate(async (base) => {
      const { A } = await import(base + "/apps/studio/workbench/state.mjs");
      await A.open("update-preserve", "existing");
    }, next.assetBase);
    await page
      .locator("#ed1 .cm-content")
      .filter({ hasText: "UNAPPLIED DRAFT" })
      .waitFor();
    const applied = await page.evaluate(async (base) => {
      const { ctx } = await import(base + "/apps/studio/workbench/state.mjs");
      return await ctx.engine.fs.read("/index.php");
    }, next.assetBase);
    assert.ok(!String(applied).includes("UNAPPLIED DRAFT"));
    const loaded = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((p) => /\.(mjs|wasm|css)(\?|$)/.test(p)),
    );
    assert.ok(
      loaded
        .filter((p) => p.includes("/_alwis/"))
        .every((p) => p.includes(next.assetBase)),
    );
    reports.push({
      browser: name,
      passed: true,
      sourceRevision: old.revision,
      completeAssetSwitch: true,
      unappliedDraftPreserved: true,
      appliedPHPUnchanged: true,
    });
    console.log(
      name,
      "complete build update preserved the unapplied draft and applied PHP",
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
    await rm(root, { recursive: true, force: true });
  }
}

await writeFile(
  "build-work/site-updates.json",
  JSON.stringify(reports, null, 2) + "\n",
);
