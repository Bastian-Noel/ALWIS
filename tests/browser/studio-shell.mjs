/** Rendered shell, real errors, keyboard, responsive structure and bounded log. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createStudioServer} from '../../scripts/serve-studio.mjs';
const repo=resolve(new URL('../..',import.meta.url).pathname);
const playwright=await import(pathToFileURL(resolve(repo,'build-work/php/node_modules/playwright/index.mjs')).href);
const server=createStudioServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,output=resolve(repo,'build-work/studio-ui');await mkdir(output,{recursive:true});
try{
 for(const name of (process.argv[2]??'chromium,firefox').split(',')){
  const browser=await playwright[name].launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}: {})});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
   await page.goto(origin);await page.getByRole('status').filter({hasText:'Prêt à ouvrir un projet.'}).waitFor();
   assert.equal(await page.locator('[role=tab]').count(),6);assert.equal(await page.locator('[role=tabpanel]:visible').count(),1);
   await page.locator('#tab-editor').focus();await page.keyboard.press('End');await page.locator('#tab-journal[aria-selected=true]').waitFor();await page.keyboard.press('ArrowRight');await page.locator('#tab-editor[aria-selected=true]').waitFor();
   await page.screenshot({path:resolve(output,name+'-empty.png'),fullPage:true});
   await page.locator('#project').fill('invalid/name');await page.locator('#open').click();await page.locator('#error-banner').waitFor();assert.equal(await page.locator('#project').getAttribute('aria-invalid'),'true');
   await page.locator('#show-error').click();await page.locator('#panel-journal').waitFor();assert.ok((await page.locator('#journal-entries').textContent()).includes('Nom de projet'));
   const downloading=page.waitForEvent('download');await page.locator('#export-log').click();const download=await downloading;const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.ok(exported.entries.some(e=>e.level==='error'));
   await page.locator('#dismiss-error').click();
   const project='shell-'+crypto.randomUUID();await page.locator('#project').fill(project);await page.locator('#open').click();await page.locator('#status').filter({hasText:'Projet prêt.'}).waitFor();
   await page.locator('#demo').click();await page.locator('#status').filter({hasText:'Exemple chargé.'}).waitFor();
   await page.locator('#tab-editor').click();assert.match(await page.locator('#editor-tool .source').evaluate(e=>e.value),/session_start/);
   await page.screenshot({path:resolve(output,name+'-editor.png'),fullPage:true});
   await page.locator('#tab-resources').click();await page.locator('#refresh-resources').click();await page.locator('#sql-phase').filter({hasText:'À la demande'}).waitFor();assert.notEqual(await page.locator('#memory-used').textContent(),'—');
   await page.locator('#tab-sql').click();await page.locator('#sql-tool .query .cm-content').fill('SELECT missing_column');await page.locator('#sql-tool .run').click();await page.locator('#status[data-error]').filter({hasText:'42S22'}).waitFor();assert.match(await page.locator('#error-recovery').textContent(),/Corrigez le SQL/);
   await page.locator('#show-error').click();await page.locator('#journal-entries .diagnostic-entry[data-level=error]').first().locator('summary').click();
   await page.screenshot({path:resolve(output,name+'-error.png'),fullPage:true});await page.locator('#dismiss-error').click();
   await page.locator('#import-files').setInputFiles({name:'failure.php',mimeType:'text/plain',buffer:Buffer.from('<?php throw new RuntimeException("real-php-diagnostic");')});await page.locator('#status').filter({hasText:'Fichiers importés.'}).waitFor();
   await page.locator('#tab-clients').click();await page.locator('#preview-path').fill('/failure.php');const opened=page.waitForEvent('popup');await page.locator('#window').click();const client=await opened;
   await page.locator('#error-title').filter({hasText:'Requête PHP'}).waitFor();await page.locator('#show-error').click();const expanded=page.locator('#journal-entries .diagnostic-entry[data-level=error]').first();await expanded.locator('summary').click();assert.match(await page.locator('#journal-entries').textContent(),/real-php-diagnostic/);
   const expandedId=await expanded.getAttribute('data-entry-id');await expanded.locator('summary').focus();const count=Number(await page.locator('#error-count').textContent());await client.reload();await page.waitForFunction(count=>Number(document.querySelector('#error-count').textContent)>count,count);assert.equal(await page.locator(`[data-entry-id="${expandedId}"]`).getAttribute('open'),'');assert.equal(await page.evaluate(()=>document.activeElement.closest('.diagnostic-entry')?.dataset.entryId),expandedId);
   await client.close();await page.locator('#dismiss-error').click();
   const layouts=[];
   for(const width of [320,768,1440]){
    await page.setViewportSize({width,height:1000});
    for(const panel of ['editor','sql','schema','clients','resources','journal']){
     await page.locator('#tab-'+panel).click();
     const layout=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,panel:document.querySelector('[role=tab][aria-selected=true]').dataset.panel}));layouts.push(layout);assert.ok(layout.scroll<=layout.viewport+1,JSON.stringify(layout));
    }
   }
   await page.setViewportSize({width:320,height:1000});await page.locator('#tab-editor').click();await page.screenshot({path:resolve(output,name+'-mobile.png'),fullPage:true});
   await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.style.fontSize='200%');await page.locator('#tab-resources').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>document.documentElement.style.fontSize='');
   await page.locator('#close').click();await page.locator('#status').filter({hasText:'Projet fermé'}).waitFor();assert.equal(await page.locator('#memory-used').textContent(),'—');assert.deepEqual(pageErrors,[]);
   await page.goto(origin+'/apps/studio/interface-stress.html');await page.locator('#scenarios section').nth(9).waitFor();await page.screenshot({path:resolve(output,name+'-diagnostic-stress.png'),fullPage:true});
   await writeFile(resolve(output,name+'.json'),JSON.stringify({passed:true,browser:name,version:browser.version(),project,layouts,checks:['six keyboard tabs','empty state','project validation and recovery','JSON diagnostic export','real engine measurements','real SQL error and SQLSTATE','real PHP error diagnostics','log entries keep expansion and keyboard focus on incoming HTTP','320/768/1440 no page overflow','200% text resize','close clears measurements','diagnostic stress page rendered'],pageErrors},null,2)+'\n');console.log(name,'studio shell passed');
  }finally{await browser.close();}
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
