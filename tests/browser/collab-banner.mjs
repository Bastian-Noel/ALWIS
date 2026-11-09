import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createStudioServer } from "../../scripts/serve-studio.mjs";

/** Regression: collaboration errors must appear in the visible workspace, not after #app. */
const root = resolve(new URL("../..", import.meta.url).pathname);
const { chromium, firefox } = await import(
  pathToFileURL(resolve(root, "build-work/php/node_modules/playwright/index.mjs")).href
);
const server = createStudioServer();
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
try {
  for (const [name, type] of [["chromium", chromium], ["firefox", firefox]]) {
    const browser = await type.launch({
      headless: true,
      ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}),
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      await page.evaluate(async () => {
        const { PresenceUI } = await import("/apps/studio/collab/presence-ui.mjs");
        const ui = new PresenceUI({
          slot: document.querySelector("#collabSlot"),
          config: { canStart: () => false },
          getFollowing: () => null,
        });
        window.__bannerTestUI = ui;
        ui.session = {
          status: "closed",
          closedReason: "full",
          role: "guest",
          hostState: "online",
          peer: () => null,
        };
        ui.renderBanner();
      });
      for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 700 }]) {
        await page.setViewportSize(viewport);
        const info = await page.locator(".cb-banner").evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const top = document.querySelector(".top").getBoundingClientRect();
          return {
            parentId: element.parentElement.id,
            nextId: element.nextElementSibling?.id,
            visible: !element.hidden,
            kind: element.dataset.kind,
            message: element.textContent,
            rect: { top: rect.top, bottom: rect.bottom, width: rect.width },
            headerBottom: top.bottom,
            viewport: { width: innerWidth, height: innerHeight },
          };
        });
        assert.equal(info.parentId, "main", name + ": banner must be a child of main");
        assert.equal(info.nextId, "alertHost", name + ": before the existing alerts");
        assert.ok(info.visible, name + ": banner hidden");
        assert.equal(info.kind, "err");
        assert.match(info.message, /session est complète/i);
        assert.ok(info.rect.top >= info.headerBottom - 2, name + ": banner overlaps header");
        assert.ok(info.rect.bottom < info.viewport.height, name + ": banner outside viewport");
        assert.ok(info.rect.width > 180, name + ": banner too narrow");
      }
      await page.evaluate(() => {
        const ui = window.__bannerTestUI;
        ui.session.status = "reconnecting";
        ui.renderBanner();
      });
      assert.match(await page.locator(".cb-banner").textContent(), /Connexion perdue/);
      assert.equal(await page.locator(".cb-banner").getAttribute("data-kind"), "warn");
      await page.evaluate(() => {
        const ui = window.__bannerTestUI;
        ui.session.status = "closed";
        ui.session.closedReason = "left";
        ui.renderBanner();
      });
      assert.equal(await page.locator(".cb-banner").isVisible(), false, name + ": leave must hide banner");
      console.log(name, "collaboration banner placement and lifecycle OK");
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((ok) => server.close(ok));
}
