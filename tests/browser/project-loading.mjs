import assert from 'node:assert/strict';
import { createStudioServer } from '../../scripts/serve-studio.mjs';
import { chromium, firefox } from '../../build-work/php/node_modules/playwright/index.mjs';
const server = createStudioServer();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await (process.argv[2] === 'firefox' ? firefox : chromium).launch({headless:true, args:['--no-sandbox']});
try {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('#stext').filter({hasText:'Prêt'}).waitFor();
  await page.evaluate(async () => {
    const { withProjectLoading } = await import('/apps/studio/workbench/project-loading.mjs');
    window.loadingResult = withProjectLoading(async step => {
      window.loadingStep = step;
      await new Promise(resolve => window.finishLoading = resolve);
    });
  });
  await page.waitForFunction(() => !!window.loadingStep);
  assert.equal(await page.locator('#app').evaluate(el => el.inert), true);
  assert.equal(await page.locator('.project-loading').getAttribute('aria-live'), 'polite');
  assert.equal(await page.locator('.project-loading-dots i').count(), 3);
  await page.evaluate(() => window.loadingStep('Lecture des fichiers…'));
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.project-loading-step p').count(), 1);
  assert.equal(await page.locator('.project-loading-step').innerText(), 'Lecture des fichiers…');
  assert.equal(await page.locator('.project-loading').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  assert.deepEqual(await page.evaluate(async () => (await axe.run(document)).violations.map(v=>v.id)), []);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.project-loading-dots i').first().evaluate(el=>getComputedStyle(el).animationName), 'none');
  await page.evaluate(async () => {window.finishLoading(); await window.loadingResult;});
  assert.equal(await page.locator('.project-loading').count(), 0);
  assert.equal(await page.locator('#app').evaluate(el => el.inert), false);
  const rejected = await page.evaluate(async () => {
    const { withProjectLoading } = await import('/apps/studio/workbench/project-loading.mjs');
    try {await withProjectLoading(async () => {throw Error('failed');});} catch(e) {return e.message;}
  });
  assert.equal(rejected, 'failed');
  assert.equal(await page.locator('.project-loading').count(), 0);
  assert.equal(await page.locator('#app').evaluate(el => el.inert), false);
  console.log('PASS project loading: milestones, single line, activity dots, mobile, axe, reduced motion, cleanup after success/failure');
} finally {await browser.close(); await new Promise(r=>server.close(r));}
