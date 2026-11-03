import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const root = resolve(new URL("../..", import.meta.url).pathname),
  { chromium } = await import(
    pathToFileURL(
      resolve(root, "build-work/php/node_modules/playwright/index.mjs"),
    ).href
  ),
  server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(60000);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({
    path: resolve(root, "node_modules/axe-core/axe.min.js"),
  });
  const states = [];
  async function audit(name) {
    const result = await page.evaluate(() =>
      axe.run(document, { resultTypes: ["violations"] }),
    );
    states.push({ name, violations: result.violations });
    if (result.violations.length)
      console.log(
        JSON.stringify(
          {
            name,
            violations: result.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes
                .map((n) => ({ target: n.target, summary: n.failureSummary }))
                .slice(0, 8),
            })),
          },
          null,
          2,
        ),
      );
  }
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    await audit("launcher " + theme);
  }
  await page.locator("#pn").fill("accessibility");
  await page.locator("[data-act=create]").click();
  await page.locator("#ed1 .cm-content").waitFor();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    await audit("code " + theme);
  }
  await page.evaluate(async () => {
    const { A, ctx, S } = await import("/apps/studio/workbench/state.mjs");
    S.db = "test";
    await A.nav("data");
    await ctx.engine.db.query(
      "CREATE TABLE parent(id INT PRIMARY KEY);CREATE TABLE child(id INT PRIMARY KEY,pid INT,FOREIGN KEY(pid) REFERENCES parent(id));INSERT INTO parent VALUES(1);INSERT INTO child VALUES(1,1);",
      "test",
    );
    await A.nav("data");
    await A.selectTable("child");
    S.dmode = "struct";
    ctx.draw();
  });
  for (const theme of ['light','dark']) {
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    const action=page.locator('td.ra button').first();
    await action.hover();
    const colors=await action.evaluate(el=>{
      const s=getComputedStyle(el);
      return {color:s.color,background:s.backgroundColor};
    });
    const luminance=text=>{
      const rgb=text.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
      return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    };
    const a=luminance(colors.color),b=luminance(colors.background);
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,JSON.stringify(colors));
    await audit('row action hover '+theme);
  }
  await audit("structure");
  await page.locator("[data-act=columnForm]").click();
  await audit("column dialog");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.evaluate(async () => {
    const { A } = await import("/apps/studio/workbench/state.mjs");
    await A.nav("schema");
  });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    await audit("schema " + theme);
  }
  await page.evaluate(async () => {
    const { A } = await import("/apps/studio/workbench/state.mjs");
    await A.nav("sessions");
  });
  await audit("sessions");
  await page.evaluate(async () => {
    const { A } = await import("/apps/studio/workbench/state.mjs");
    await A.measure();
    A.dockTab("res");
  });
  await audit("resources");
  await mkdir(resolve(root, "apps/studio/receipts/alwis"), { recursive: true });
  await writeFile(
    resolve(root, "apps/studio/receipts/alwis/accessibility.json"),
    JSON.stringify(
      {
        passed: states.every((s) => !s.violations.length),
        axe: "4.11.1",
        browser: browser.version(),
        scope: "Automated Chromium; screen readers and Safari not verified",
        states,
      },
      null,
      2,
    ),
  );
  assert.ok(states.every((s) => !s.violations.length));
  console.log("ALWIS accessibility passed", states.length);
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
