import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const pw = await import(
  pathToFileURL(resolve("build-work/php/node_modules/playwright/index.mjs"))
    .href
);
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  for (const name of (process.argv[2] ?? "chromium,firefox").split(",")) {
    const browser = await pw[name].launch({
      headless: true,
      ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}),
    });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.evaluate(async () => {
        const { createCodeEditor } = await import(
          "/apps/studio/editor/dist/codemirror.mjs"
        );
        document.querySelector(".app").style.display = "none";
        document.body.style.overflow = "auto";
        const host = document.createElement("div");
        host.style.cssText =
          "position:fixed;inset:0;background:var(--sheet);z-index:100";
        host.id = "test";
        document.body.append(host);
        window.model = createCodeEditor(host, { path: "/test.php" });
      });
      const content = page.locator("#test .cm-content");
      async function set(path, text) {
        await page.evaluate(
          ({ path, text }) => {
            const host = document.querySelector("#test");
            host.value = text;
            window.model.setPath(path);
            host.selectionStart = text.length;
            host.selectionEnd = text.length;
            window.model.view.focus();
          },
          { path, text },
        );
        await page.keyboard.press("Control+End");
      }
      await set("/test.PHP", "");
      await page.keyboard.type("<section>");
      assert.equal(await content.innerText(), "<section></section>");
      await set("/test.php", "<?php fore");
      await page.keyboard.press("Control+Space");
      await page
        .locator(".cm-tooltip-autocomplete li")
        .filter({ hasText: "foreach" })
        .first()
        .waitFor();
      await page.keyboard.press("Tab");
      assert.match(
        await content.innerText(),
        /foreach \(\$items as \$item\) \{/,
      );
      await page.keyboard.type("$users");
      await page.keyboard.press("Tab");
      await page.keyboard.type("$user");
      assert.match(await content.innerText(), /foreach \(\$users as \$user\)/);
      await set("/test.html", "!");
      await page.keyboard.press("Enter");
      assert.match(await content.innerText(), /<!DOCTYPE html>/i);
      await set("/test.html", "ul>li*3");
      await page.keyboard.press("Tab");
      assert.equal((await content.innerText()).match(/<li>/g)?.length, 3);
      await set("/test.php", '<?php $utilisateur="Alice"; echo $Utilisateur;');
      await page
        .locator("button")
        .filter({ hasText: /^Problèmes$/ })
        .click();
      await page
        .locator(".cm-diagnostic")
        .filter({ hasText: "vouliez-vous" })
        .waitFor();
      await page
        .locator("button")
        .filter({ hasText: "Remplacer par $utilisateur" })
        .click();
      assert.match(await content.innerText(), /echo \$utilisateur;/);
      await set("/test.php", '<?php $nom="Alice"\necho $nom;');
      await page
        .locator(".cm-diagnostic")
        .filter({ hasText: "point-virgule" })
        .waitFor();
      await page.locator("button").filter({ hasText: "Ajouter ;" }).click();
      assert.match(await content.innerText(), /"Alice";/);
      await set("/test.js", "function greet(name, count) {}\ngreet(");
      await page.locator(".cm-signature").filter({ hasText: "name" }).waitFor();
      await set("/test.js", "$('button').");
      await page.keyboard.press("Control+Space");
      const add = page
        .locator(".cm-tooltip-autocomplete li")
        .filter({ hasText: "addClass" });
      await add.waitFor();
      await page
        .locator(".cm-tooltip-autocomplete li[aria-selected=true]")
        .waitFor();
      await page
        .locator(".cm-completionInfo")
        .filter({ hasText: "JQuery" })
        .waitFor();
      await page.keyboard.press("Escape");
      await set("/test.js", "const customer = 1;\nconsole.log(customer);");
      await page.evaluate(() => {
        document.querySelector("#test").selectionStart = 35;
        document.querySelector("#test").selectionEnd = 35;
      });
      await page.keyboard.press("F12");
      await page.waitForFunction(
        () => window.model.view.state.selection.main.head === 6,
      );
      await page.keyboard.press("F2");
      await page.getByLabel("Nouveau nom du symbole").fill("client");
      await page
        .getByRole("button", { name: "Prévisualiser", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Appliquer le renommage", exact: true })
        .click();
      assert.equal(
        await page.locator("#test").evaluate((e) => e.value),
        "const client = 1;\nconsole.log(client);",
      );
      await page.keyboard.press("Control+z");
      assert.match(await content.innerText(), /customer/);
      await set("/test.js", "");
      await page.keyboard.type("cons");
      await page.keyboard.press("Control+Space");
      await page.locator(".cm-tooltip-autocomplete").waitFor();
      await page.keyboard.press("Enter");
      assert.equal(
        await page.locator("#test").evaluate((e) => e.value),
        "cons\n",
      );
      assert.deepEqual(errors, []);
      await mkdir("apps/studio/receipts/editor", { recursive: true });
      await writeFile(
        `apps/studio/receipts/editor/intelligence-${name}.json`,
        JSON.stringify(
          {
            passed: true,
            browser: name,
            version: browser.version(),
            checks: [
              "PHP snippets and Tab fields",
              "case-insensitive extensions and HTML closing",
              "HTML Emmet",
              "PHP variable casing and parser-verified semicolon correction",
              "signature help",
              "lazy jQuery documentation",
              "definition navigation",
              "semantic rename preview and undo",
              "Enter does not accept completion",
            ],
            errors,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(
        name,
        "practical editor: snippets, paired HTML, Emmet, PHP repairs, signature, navigation, Enter passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
