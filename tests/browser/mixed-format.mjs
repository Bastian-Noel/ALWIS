import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  chromium,
  firefox,
} from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
import { readFileSync } from "node:fs";
const historicalCampus = readFileSync(
  new URL("../fixtures/mixed-campus.php", import.meta.url),
  "utf8",
);
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
await mkdir("build-work/mixed-format", { recursive: true });
const source =
  '<?php $rows=[["id"=>1,"name"=>"Alice"],["id"=>2,"name"=>"Bob"]]; $selected=2; ?><!doctype html><html><head><title>PHP et HTML</title></head><body><main><?php if ($rows): ?><form><select name="person"><?php foreach ($rows as $row): ?><option value="<?= $row["id"] ?>" <?= $row["id"] === $selected ? "selected" : "" ?>><?= $row["name"] ?></option><?php endforeach; ?></select></form><p>a<strong><?= "b" ?></strong>c</p><pre>  a\n b</pre><textarea>  c\n d</textarea><?php else: ?><p>Vide</p><?php endif; ?></main></body></html>';
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
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator("#stext").filter({ hasText: "Prêt" }).waitFor();
      await page.locator("#pn").fill("format-mixte");
      await page.locator("input[name=tpl][value=empty]").check();
      await page.locator("[data-act=create]").click();
      await page.locator("#ed1 .cm-content").waitFor();
      const result = await page.evaluate(
        async ({ source, campus }) => {
          const { A, eng } = await import("/apps/studio/workbench/state.mjs");
          const { refreshFiles } =
            await import("/apps/studio/workbench/views/explorer.mjs");
          const { editorInstances } =
            await import("/apps/studio/workbench/ui.mjs");
          const read = () =>
            editorInstances()
              .find((e) => e.kind === "editor")
              .model.view.state.doc.toString();
          const inspect = (html) => {
            const doc = new DOMParser().parseFromString(html, "text/html");
            return {
              title: doc.title,
              options: [...doc.querySelectorAll("option")].map((o) => [
                o.value,
                o.selected,
                o.textContent.trim(),
              ]),
              p: doc.querySelector("p").textContent,
              pre: doc.querySelector("pre").textContent,
              textarea: doc.querySelector("textarea").value,
            };
          };
          await eng().fs.write("/mixed.php", source);
          await eng().fs.write("/campus.php", campus);
          await refreshFiles();
          const session = eng().sessions.list()[0].id;
          const before = await eng().sessions.run(session, "/mixed.php");
          await A.openFile("/mixed.php");
          await A.editorFormat();
          const formatted = read();
          await A.editorFormat();
          const twice = read();
          await A.applyAll();
          const after = await eng().sessions.run(session, "/mixed.php");
          await A.openFile("/campus.php");
          await A.editorFormat();
          const campusResult = read();
          await A.editorFormat();
          return {
            beforeStatus: before.status,
            afterStatus: after.status,
            before: inspect(before.text),
            after: inspect(after.text),
            formatted,
            twice,
            campusResult,
            campusTwice: read(),
          };
        },
        { source, campus: historicalCampus },
      );
      assert.equal(result.beforeStatus, 200);
      assert.equal(result.afterStatus, 200);
      assert.deepEqual(result.after, result.before);
      assert.equal(result.formatted, result.twice);
      assert.equal(result.campusResult, result.campusTwice);
      assert.match(result.formatted, /\n\s+<head>/);
      assert.match(result.formatted, /<\?php foreach[^\n]+\?>\n\s+<option/);
      assert.ok(
        result.campusResult.includes(
          "<title>Campus ALWIS — <?= h($pages[$page]) ?></title>",
        ),
      );
      assert.deepEqual(errors, []);
      await writeFile(
        `build-work/mixed-format/campus-${engine.name()}.php`,
        result.campusResult,
      );
      await page.screenshot({
        path: `build-work/mixed-format/${engine.name()}.png`,
      });
      console.log(
        engine.name() +
          ": mixed formatting, idempotence and real PHP output passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
