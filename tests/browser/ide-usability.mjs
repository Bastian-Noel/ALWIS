import assert from 'node:assert/strict';
import {createStudioServer} from '../../scripts/serve-studio.mjs';
import {chromium} from '../../build-work/php/node_modules/playwright/index.mjs';
const server=createStudioServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.locator('#stext').filter({hasText:'Prêt'}).waitFor();
 await page.evaluate(()=>{
  window.pcContent='<?php echo "PC";';
  const file={kind:'file',getFile:async()=>new Blob([window.pcContent]),createWritable:async()=>({write:async value=>{window.pcContent=value},close:async()=>{},abort:async()=>{}})};
  window.showDirectoryPicker=async()=>({name:'cours',async *entries(){yield ['index.php',file]},getFileHandle:async()=>file});
 });
 await page.locator('[data-act=openLocalFolder]').click();
 await page.locator('#modal [data-v=open]').click();
 await page.locator('#pname').filter({hasText:'PC : cours'}).waitFor();
 assert.equal(await page.locator('#ed1 .cm-editor-tools').count(),0);
 assert.equal(await page.locator('#codeTools [data-tool=Formater]').count(),1);
 assert.match(await page.locator('#ed1').evaluate(el=>el.value),/PC/);
 await page.locator('#ed1 .cm-content').fill('<?php echo "saved";');
 await page.locator('#primary').click();
 await page.waitForFunction(()=>document.querySelector('#primary').textContent==='Projet sauvegardé');
 assert.equal(await page.evaluate(()=>window.pcContent),'<?php echo "saved";');
 await page.evaluate(()=>{window.pcContent='<?php echo "external";';});
 await page.locator('#ed1 .cm-content').fill('<?php echo "my draft";');
 const refused=await page.evaluate(async()=>{const {A,S,ctx}=await import('/apps/studio/workbench/state.mjs');const ok=await A.apply('/index.php',true);return {ok,draft:S.drafts['/index.php'],base:S.base['/index.php'],file:await ctx.engine.fs.read('/index.php')};});
 assert.equal(refused.ok,false);assert.match(refused.draft,/my draft/);assert.equal(refused.file.text,refused.base);assert.match(await page.evaluate(()=>window.pcContent),/external/);
 await page.evaluate(async()=>{const {log,ctx}=await import('/apps/studio/workbench/state.mjs');log('e','Erreur de test');ctx.draw();});
 assert.match(await page.locator('#sCount').innerText(),/erreur/);
 await page.locator('#sDock').click();assert.equal(await page.locator('#sCount').innerText(),'');
 await page.evaluate(async()=>{const {A}=await import('/apps/studio/workbench/state.mjs');await A.nav('data');});
 const tree=page.locator('[data-act=toggleDb][data-arg=test]');
 assert.equal(await tree.getAttribute('aria-expanded'),'true');await tree.click();assert.equal(await tree.getAttribute('aria-expanded'),'false');await tree.click();assert.equal(await tree.getAttribute('aria-expanded'),'true');
 const systems=await page.locator('#dbtree .db').evaluateAll(rows=>rows.map(r=>r.classList.contains('sys')));
 assert.equal(systems[0],false);assert.ok(systems.slice(systems.indexOf(true)).every(Boolean));
 await page.locator('[data-act=dmode][data-arg=sql]').click();
 await page.locator('#edq .cm-content').fill('sel');await page.locator('#edq .cm-content').press('Control+End');await page.keyboard.press('Control+Space');
 await page.locator('.cm-tooltip-autocomplete li').filter({hasText:'SELECT'}).first().waitFor();await page.keyboard.press('Escape');
 for(const width of [320,768,1500]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width);}
 assert.deepEqual(errors,[]);
 console.log('PASS toolbar, PC folder save/conflict, one-step project save, read notifications, collapsible DB tree, uppercase SQL completion, mobile widths');
} finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
