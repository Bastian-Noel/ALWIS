import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import {
  chromium,
  firefox,
} from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
await mkdir("build-work/preview-browser", { recursive: true });
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1000 },
      });
      page.setDefaultTimeout(60000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      await page.locator("#pn").fill("browser-test");
      await page.locator("input[name=tpl][value=empty]").check();
      await page.locator("[data-act=create]").click();
      await page.locator("#ed1 .cm-content").waitFor();
      await page.evaluate(async () => {
        const { A, eng } = await import("/apps/studio/workbench/state.mjs");
        await eng().fs.write(
          "/home.html",
          "<!doctype html><html><head><title>Atelier</title></head><body><h1>Bienvenue</h1><a href=\"/next.php?q=bonjour\">Page suivante</a><button onclick=\"fetch('/api.php?source=page',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'name=Alice'})\">Envoyer</button><img src=\"/missing.png\"></body></html>",
        );
        await eng().fs.write(
          "/next.php",
          "<!doctype html><html><head><title>Suivante</title></head><body><h1>Deuxième page</h1></body></html>",
        );
        await eng().fs.write(
          "/api.php",
          '<?php http_response_code(201); header("Content-Type: application/json"); header("X-Test: inspect"); echo json_encode(["ok" => true, "name" => $_POST["name"]]);',
        );
        await A.pvOpen("/home.html");
      });
      const frame = page.frameLocator("#pvFrames iframe");
      await frame.getByText("Bienvenue", { exact: true }).waitFor();
      assert.equal(await page.locator("#pvBack").isDisabled(), true);
      await frame.getByText("Page suivante", { exact: true }).click();
      await frame.getByText("Deuxième page", { exact: true }).waitFor();
      await page.waitForFunction(
        () => document.querySelector("#pvPath").value === "/next.php?q=bonjour",
      );
      await page.locator("#pvBack").click();
      await frame.getByText("Bienvenue", { exact: true }).waitFor();
      await page.locator("#pvForward").click();
      await frame.getByText("Deuxième page", { exact: true }).waitFor();
      await page.locator("#pvBack").click();
      await frame.getByText("Bienvenue", { exact: true }).waitFor();
      await page.locator("#pvPath").fill("/next.php?q=adresse");
      await page.locator("#pvPath").press("Enter");
      await frame.getByText("Deuxième page", { exact: true }).waitFor();
      await page.locator("#pvBack").click();
      await frame.getByText("Bienvenue", { exact: true }).waitFor();
      await page.locator("#pvNetwork").click();
      await frame.getByText("Envoyer", { exact: true }).click();
      const request = page.getByRole("button", {
        name: "Inspecter POST /api.php?source=page",
        exact: true,
      });
      await request.waitFor();
      assert.match(await page.locator("#networkBody").innerText(), /201/);
      assert.match(await page.locator("#networkBody").innerText(), /404/);
      await request.click();
      assert.match(
        await page.locator("#networkDetail").innerText(),
        /X-Test|X-test|x-test/,
      );
      assert.equal(await page.locator(".network-list th").count(), 1);
      await page.getByRole("tab", { name: "Requête", exact: true }).click();
      assert.match(
        await page.locator("#networkDetail").innerText(),
        /name=Alice/,
      );
      await page.getByRole("tab", { name: "Réponse", exact: true }).click();
      assert.match(
        await page.locator("#networkDetail").innerText(),
        /"name":"Alice"/,
      );
      await page.locator("#network-tab-response").focus();
      await page.keyboard.press("Home");
      assert.equal(
        await page
          .locator("#network-tab-headers")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      assert.match(
        await page.locator("#networkDetail").innerText(),
        /name=Alice/,
      );
      await page.getByRole("tab", { name: "Réponse", exact: true }).click();
      await page.evaluate(
        () =>
          (window.inspectedResponse =
            document.querySelector(".network-response")),
      );
      await frame.getByText("Envoyer", { exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            '[aria-label="Inspecter POST /api.php?source=page"]',
          ).length === 2,
      );
      assert.equal(
        await page.evaluate(
          () =>
            window.inspectedResponse ===
            document.querySelector(".network-response"),
        ),
        true,
      );
      // Actual drag across iframe/editor, then keyboard adjustment and persistence.
      const handle = page.locator("#previewResize"),
        before = await page.locator(".pv-col").boundingBox(),
        rect = await handle.boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.mouse.down();
      await page.mouse.move(rect.x - 150, rect.y + rect.height / 2, {
        steps: 5,
      });
      assert.match(await handle.getAttribute("class"), /dragging/);
      await page.mouse.up();
      assert.ok(
        (await page.locator(".pv-col").boundingBox()).width >
          before.width + 100,
      );
      assert.equal(await page.locator(".resize-shield").count(), 0);
      await handle.focus();
      const widthValue = Number(await handle.getAttribute("aria-valuenow"));
      await page.keyboard.press("ArrowRight");
      assert.ok(
        Number(await handle.getAttribute("aria-valuenow")) > widthValue,
      );
      const vertical = page.locator("#networkResize"),
        vrect = await vertical.boundingBox(),
        vbefore = await page.locator("#networkPanel").boundingBox();
      await page.mouse.move(
        vrect.x + vrect.width / 2,
        vrect.y + vrect.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(vrect.x + vrect.width / 2, vrect.y - 90, {
        steps: 5,
      });
      await page.mouse.up();
      assert.ok(
        (await page.locator("#networkPanel").boundingBox()).height >
          vbefore.height + 60,
      );
      await vertical.focus();
      const heightValue = Number(await vertical.getAttribute("aria-valuenow"));
      await page.keyboard.press("ArrowDown");
      assert.ok(
        Number(await vertical.getAttribute("aria-valuenow")) < heightValue,
      );
      await page.getByRole("tab", { name: "En-têtes", exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelector("#toast").children.length === 0,
      );
      await page.screenshot({
        path: `build-work/preview-browser/${engine.name()}-light.png`,
      });
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
      });
      await page.screenshot({
        path: `build-work/preview-browser/${engine.name()}-dark.png`,
      });
      await page
        .getByRole("button", { name: "Revenir à la liste complète" })
        .click();
      assert.equal(await page.locator(".network-list th").count(), 5);
      await page.getByRole("button", { name: "Effacer les requêtes" }).click();
      assert.equal(await page.locator(".network-list tbody tr").count(), 0);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: `build-work/preview-browser/${engine.name()}-mobile.png`,
      });
      assert.equal(await handle.isVisible(), false);
      assert.ok(await page.locator("#pvNetwork").isVisible());
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page
        .getByRole("button", { name: "Fermer le panneau Réseau" })
        .click();
      assert.equal(await page.locator("#networkPanel").isVisible(), false);
      assert.deepEqual(errors, []);
      console.log(
        `${engine.name()}: browser navigation, network POST/404/headers/body, horizontal and vertical drag/keyboard, mobile passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
