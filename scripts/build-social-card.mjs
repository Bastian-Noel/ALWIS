/** Capture the real Campus in ALWIS, then render the social sharing card. */
import { chromium } from "../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "./serve-studio.mjs";
const server = createStudioServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("alwis-theme", "dark"));
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.locator("#pn").fill("Campus");
  await page.locator("[data-act=create]").click();
  await page.locator("#ed1 .cm-content").waitFor();
  await page.locator(".project-loading").waitFor({ state: "hidden" });
  await page.evaluate(async () => {
    const { A } = await import("/apps/studio/workbench/state.mjs");
    await A.pvOpen("/index.php");
  });
  await page
    .frameLocator("#pvFrames iframe")
    .getByRole("heading", { name: "Le Campus", exact: true })
    .waitFor();
  await page.waitForFunction(() => {
    const d = document.querySelector("#pvFrames iframe")?.contentDocument;
    return (
      d?.body &&
      getComputedStyle(d.body).backgroundColor === "rgb(247, 245, 239)" &&
      [...d.images].every((img) => img.complete && img.naturalWidth > 0)
    );
  });
  await page.evaluate(() =>
    document.querySelector("#cgrid").style.setProperty("--editor-fr", "28fr"),
  );
  await page.frameLocator("#pvFrames iframe").locator("#content").evaluate((el) => {
    el.scrollTop = 0;
    el.scrollLeft = 0;
  });
  await page.waitForTimeout(500);
  const shot = await page.screenshot();
  const card = await context.newPage();
  await card.setViewportSize({ width: 1200, height: 630 });
  await card.setContent(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#192226;color:#f4f3eb;font-family:system-ui,sans-serif}main{padding:28px 36px}header{display:flex;align-items:center;justify-content:space-between}b{font-size:29px;letter-spacing:-1px}header span{font-size:16px;color:#c5d3cd}h1{font-size:34px;line-height:1.2;font-weight:600;letter-spacing:-1px;margin:15px 0 24px}.screen{height:438px;overflow:hidden;border:1px solid #61716b;border-radius:8px;background:#11181b}.screen img{width:1126px;display:block}footer{font-size:13px;color:#c5d3cd;margin-top:12px}</style><main><header><b>ALWIS</b><span>PHP · HTML · CSS · JavaScript · MariaDB</span></header><h1>Votre atelier web, dans le navigateur.</h1><div class="screen"><img src="data:image/png;base64,${shot.toString("base64")}" alt="L’éditeur ALWIS et le Campus des Tilleuls"></div><footer>studio.mmi.place · Code, données et sessions dans un même atelier.</footer></main></html>`,
  );
  await card.locator("img").evaluate((img) => img.decode());
  await card.screenshot({
    path: new URL("../apps/studio/social-card.png", import.meta.url).pathname,
  });
  console.log("Social card: 1200 × 630, real ALWIS/Campus interface.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
