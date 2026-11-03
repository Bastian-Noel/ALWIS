import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
import { chromium } from "../../build-work/php/node_modules/playwright/index.mjs";
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ALWIS_CHROMIUM_PATH
    ? { executablePath: process.env.ALWIS_CHROMIUM_PATH }
    : {}),
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
  async function audit(name) {
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
    assert.deepEqual(violations, [], name);
  }
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .locator(".skip-link")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement.id), "main");
  await page.keyboard.down("Alt");
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".shortcut-hint").count(), 0);
  await page.keyboard.up("Alt");
  await page.waitForTimeout(450);
  assert.equal(await page.locator(".shortcut-hint").count(), 0);
  await page.keyboard.down("Alt");
  await page.locator(".shortcut-hint").first().waitFor();
  await page.keyboard.up("Alt");
  assert.equal(await page.locator(".shortcut-hint").count(), 0);
  await page.locator("#pn").fill("keyboard-test");
  await page.locator("input[value=empty]").check();
  await page.locator("[data-act=create]").click();
  await page.locator("#ed1 .cm-content").waitFor();
  await page.evaluate(async () => {
    const { A, ctx } = await import("/apps/studio/workbench/state.mjs");
    await ctx.engine.fs.write("/second.php", "<?php echo 2;");
    const { refreshFiles } =
      await import("/apps/studio/workbench/views/explorer.mjs");
    await refreshFiles();
    await A.openFile("/second.php");
  });
  await page.locator("#ed1 .cm-content").focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(
      () => !!document.activeElement.closest("#ed1 .cm-content"),
    ),
    false,
  );
  await page.locator('#codeTools [data-tool="Formater"]').focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.tool),
    "Problèmes",
  );
  const active = page.locator("#tabs [aria-selected=true]");
  await active.focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.arg),
    "/index.php",
  );
  assert.equal(
    await page.locator("#tabs [aria-selected=true]").getAttribute("data-arg"),
    "/second.php",
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => !!document.activeElement.closest("#tabs")),
    false,
  );
  await page.locator('#tabs [data-arg="/index.php"][role=tab]').focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      document.querySelector("#tabs [aria-selected=true]")?.dataset.arg ===
      "/index.php",
  );
  await page.waitForFunction(
    () => document.activeElement.dataset.arg === "/index.php",
  );
  await page.keyboard.press("Delete");
  await page.waitForFunction(
    () => document.querySelectorAll("#tabs [role=tab]").length === 1,
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.getAttribute("role")),
    "tab",
  );
  await page.locator("#fileMenuBtn").focus();
  await page.keyboard.press("Enter");
  await page.locator(".pop").waitFor();
  await audit("file menu");
  const first = await page.evaluate(() => document.activeElement.textContent);
  await page.keyboard.press("ArrowDown");
  assert.notEqual(
    await page.evaluate(() => document.activeElement.textContent),
    first,
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "fileMenuBtn",
  );
  assert.equal(
    await page.locator("#fileMenuBtn").getAttribute("aria-expanded"),
    "false",
  );
  await page.keyboard.press("Alt+k");
  await page.locator("#pal").waitFor({ state: "visible" });
  await audit("command palette");
  assert.equal(await page.locator("#pq").getAttribute("role"), "combobox");
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.locator("#pq").getAttribute("aria-activedescendant"),
    "palette-option-1",
  );
  await page.keyboard.down("Alt");
  await page.waitForTimeout(450);
  assert.equal(
    await page.evaluate(() =>
      document.documentElement.classList.contains("shortcut-hints"),
    ),
    true,
  );
  await page.keyboard.up("Alt");
  await page.keyboard.press("Alt+4");
  assert.equal(
    await page.evaluate(
      async () => (await import("/apps/studio/workbench/state.mjs")).S.view,
    ),
    "code",
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Alt+j");
  await page.waitForFunction(() =>
    document.querySelector("#dock").classList.contains("on"),
  );
  // Unread errors may open Journal first; start the arrow test from Requêtes.
  await page.locator("#dock-tab-req").click();
  await page.locator("#dock-tab-req").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      document.querySelector("#dock-tab-log").getAttribute("aria-selected") ===
      "true",
  );
  await page.locator("#grip").focus();
  const height = Number(
    await page.locator("#grip").getAttribute("aria-valuenow"),
  );
  await page.keyboard.press("ArrowUp");
  assert.equal(
    Number(await page.locator("#grip").getAttribute("aria-valuenow")),
    height + 24,
  );
  await page.locator("[data-act=dockClose]").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#dock").inert);
  assert.equal(await page.evaluate(() => document.activeElement.id), "sDock");
  await page.keyboard.press("Alt+2");
  await page.locator("#v-data").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.querySelector("#app").dataset.lamp !== "busy",
  );
  const tree = page.locator("#dbtree [data-act=toggleDb][data-arg=test]");
  await tree.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      document
        .querySelector("#dbtree [data-arg=test]")
        .getAttribute("aria-expanded") === "false",
  );
  await page.waitForFunction(
    () => document.activeElement.dataset.arg === "test",
  );
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () =>
      document
        .querySelector("#dbtree [data-arg=test]")
        .getAttribute("aria-expanded") === "true",
  );
  await page.keyboard.down("Alt");
  await page.locator(".shortcut-hint").first().waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await page.locator(".shortcut-hint").count(), 0);
  await page.keyboard.up("Alt");
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "AltGraph",
        code: "AltRight",
        altKey: true,
        ctrlKey: true,
        bubbles: true,
      }),
    ),
  );
  await page.waitForTimeout(450);
  assert.equal(await page.locator(".shortcut-hint").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS Alt tap/hold/release/blur/AltGr, shortcuts, file/server tabs, menus, palette, database tree, resize, focus restoration",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
