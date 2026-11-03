import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
import { makeZip } from "../../apps/studio/zip.mjs";
import { chromium } from "../../build-work/php/node_modules/playwright/index.mjs";
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
  await page.addScriptTag({
    path: resolve("node_modules/axe-core/axe.min.js"),
  });
  await mkdir("apps/studio/receipts/launcher", { recursive: true });
  async function audit() {
    assert.deepEqual(
      await page.evaluate(async () =>
        (await axe.run(document)).violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      ),
      [],
    );
  }
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    await audit();
    await page.screenshot({
      path: `apps/studio/receipts/launcher/empty-${theme}.png`,
    });
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.locator("[data-act=openLocalFolder]").scrollIntoViewIfNeeded();
    assert.ok(await page.locator("[data-act=openLocalFolder]").isVisible());
    await page.locator("#welcomeTitle").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `apps/studio/receipts/launcher/mobile-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#pn").fill("nom invalide !");
  assert.equal(await page.locator("#pgo").isDisabled(), true);
  assert.equal(await page.locator("#pn").getAttribute("aria-invalid"), "true");
  await page.locator("#pn").fill("portfolio");
  await page.locator("input[value=empty]").check();
  await page.locator("#pn").press("Enter");
  await page.locator("#ed1 .cm-content").waitFor();
  await page.evaluate(async () => {
    const { A } = await import("/apps/studio/workbench/state.mjs");
    await A.save();
    await A.close();
  });
  await page.locator("#recent [data-arg=portfolio]").waitFor();
  assert.equal(await page.locator("#recentSection").isVisible(), true);
  await page.locator("#pn").fill("portfolio");
  assert.match(await page.locator("#pgo").innerText(), /Ouvrir/);
  assert.equal(await page.locator("input[value=demo]").isDisabled(), true);
  await page.locator("#projectFilter").fill("absent");
  await page.locator(".recent-empty").waitFor();
  await page.locator("#projectFilter").fill("PORT");
  await page.locator("#recent [data-arg=portfolio]").waitFor();
  await page.locator("#projectFilter").fill("");
  await page.locator("#pn").fill("");
  const archive = Buffer.from(
    makeZip([
      {
        name: "index.php",
        bytes: new TextEncoder().encode('<?php echo "imported";'),
      },
    ]),
  );
  await page
    .locator("#zipIn")
    .setInputFiles({
      name: "portfolio.zip",
      mimeType: "application/zip",
      buffer: archive,
    });
  await page.waitForFunction(
    async () =>
      (await import("/apps/studio/workbench/state.mjs")).S.project ===
      "portfolio-2",
  );
  await page.waitForFunction(() =>
    document.querySelector("#ed1")?.value?.includes("imported"),
  );
  await page.evaluate(async () => {
    const { A } = await import("/apps/studio/workbench/state.mjs");
    await A.save();
    await A.close();
  });
  await page.locator("#recent [data-arg=portfolio]").click();
  await page.locator("#ed1 .cm-content").waitFor();
  assert.doesNotMatch(
    await page.locator("#ed1").evaluate((e) => e.value),
    /imported/,
  );
  await page.evaluate(async () => {
    const { A } = await import("/apps/studio/workbench/state.mjs");
    await A.close();
  });
  assert.equal(await page.locator("#pn").inputValue(), "");
  assert.equal(await page.locator("input[value=demo]").isDisabled(), false);
  await audit();
  await page.mouse.move(1400, 40);
  await page.screenshot({
    path: "apps/studio/receipts/launcher/recent-light.png",
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS launcher light/dark, mobile widths, validation, keyboard creation, recent/search/reopen, ZIP without name and collision protection, axe",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
