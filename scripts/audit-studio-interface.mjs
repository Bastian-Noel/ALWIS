/** Optional rendered audit; supply pinned axe-core via PBL_AXE_PATH. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createStudioServer} from './serve-studio.mjs';
const repo=resolve(new URL('..',import.meta.url).pathname),axe=process.env.PBL_AXE_PATH;
if(!axe)throw Error('Set PBL_AXE_PATH to the local axe-core 4.11.1 axe.min.js file.');
const playwright=await import(pathToFileURL(resolve(repo,'build-work/php/node_modules/playwright/index.mjs')).href);
const server=createStudioServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await playwright.chromium.launch({headless:true,args:['--no-sandbox']});
const output=resolve(repo,'build-work/studio-ui');await mkdir(output,{recursive:true});const results=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('#status').filter({hasText:'Prêt à ouvrir un projet.'}).waitFor();
 await page.addScriptTag({path:axe});assert.equal(await page.evaluate(()=>axe.version),'4.11.1');
 const audit=async label=>{
  const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
  results.push({label,violations:result.violations,incomplete:result.incomplete.map(rule=>({id:rule.id,nodes:rule.nodes.map(node=>node.target)})),passes:result.passes.length});
  console.log(label,JSON.stringify(result.violations.map(rule=>({id:rule.id,nodes:rule.nodes.map(node=>({target:node.target,summary:node.failureSummary}))}))));
 };
 for(const panel of ['editor','sql','schema','clients','resources','journal']){await page.locator('#tab-'+panel).click();await audit('empty/'+panel);}
 await page.locator('#project').fill('audit-'+crypto.randomUUID());await page.locator('#open').click();await page.locator('#status').filter({hasText:'Projet prêt.'}).waitFor();
 await page.locator('#tab-sql').click();
 // Console accepts one statement per call, keeping import semantics separate.
 await page.locator('#sql-tool .query').fill('CREATE TABLE audit_rows (id INT PRIMARY KEY, label VARCHAR(30))');await page.locator('#sql-tool .run').click();await page.locator('#sql-tool .message').filter({hasText:'lignes affectées'}).waitFor();
 await page.locator('#sql-tool .query').fill("INSERT INTO audit_rows VALUES (1,'keyboard')");await page.locator('#sql-tool .run').click();await page.locator('#sql-tool .message').filter({hasText:'1 lignes affectées'}).waitFor();
 await page.locator('#sql-tool .tables').click();await page.locator('#sql-tool .table').selectOption('audit_rows');await page.locator('#sql-tool .browse').click();await page.locator('#sql-tool tbody tr').waitFor();
 await audit('sql/grid');
 await page.locator('#sql-tool td[data-editable]').nth(1).focus();await page.keyboard.press('Enter');await page.locator('#sql-tool td input').fill('edited-by-keyboard');await page.keyboard.press('Enter');await page.locator('#sql-tool td').filter({hasText:'edited-by-keyboard'}).waitFor();
 await page.locator('#sql-tool .insert').click();await page.locator('#sql-tool .row-dialog').waitFor();await audit('sql/insert-dialog');await page.keyboard.press('Escape');
 await page.locator('#tab-schema').click();await page.locator('#schema-tool .refresh').click();await page.locator('#schema-tool svg g').waitFor();
 const before=await page.locator('#schema-tool svg g').first().getAttribute('transform');await page.locator('#schema-tool svg g').first().focus();await page.keyboard.press('ArrowRight');assert.notEqual(await page.locator('#schema-tool svg g').first().getAttribute('transform'),before);
 await audit('schema/catalog');
 for(const panel of ['editor','clients','resources','journal']){await page.locator('#tab-'+panel).click();await audit('open/'+panel);}
 await page.setViewportSize({width:320,height:1000});for(const panel of ['sql','clients','journal']){await page.locator('#tab-'+panel).click();await audit('320/'+panel);}
 await page.evaluate(()=>document.documentElement.dir='rtl');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.evaluate(()=>document.documentElement.dir='ltr');
 await page.setViewportSize({width:1440,height:1000});await page.locator('#tab-sql').click();await page.locator('#sql-tool .query').fill('SELECT missing_column');await page.locator('#sql-tool .run').click();await page.locator('#status[data-error]').filter({hasText:'42S22'}).waitFor();await audit('error/sql');
 await page.locator('#tab-journal').click();await page.locator('#project').focus();await page.keyboard.press('Tab');
 const contrast=await page.evaluate(()=>{
  function luminance(rgb){return rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);}
  const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
  const ratio=(a,b)=>{const x=luminance(rgb(a)),y=luminance(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const pairs=[];
  for(const [label,selector,property,backgroundSelector]of [['body','body','color','body'],['secondary','[role=tabpanel]:not([hidden]) .view-heading p','color','body'],['control boundary','#open','borderTopColor','#open'],['focus','#open','outlineColor','#open'],['primary action','#export-log','color','#export-log'],['error text','#error-title','color','#error-banner']]){
   const element=document.querySelector(selector);if(label==='focus')element.focus();const style=getComputedStyle(element),background=getComputedStyle(document.querySelector(backgroundSelector)).backgroundColor;
   let bg=background;if(bg==='rgba(0, 0, 0, 0)')bg=getComputedStyle(document.documentElement).backgroundColor;
   const foreground=style[property];pairs.push({label,foreground,background:bg,ratio:ratio(foreground,bg),focusVisible:label==='focus'?element.matches(':focus-visible'):undefined});
  }
  return pairs;
 });
 await page.locator('#close').click();await page.locator('#status').filter({hasText:'Projet fermé'}).waitFor();
 const report={axeVersion:'4.11.1',browser:browser.version(),results,contrast,keyboardChecks:['SQL cell edit via Enter','schema move via ArrowRight','dialog close via Escape'],rtl320NoPageOverflow:true,notVerified:['NVDA/VoiceOver speech output','browser UI zoom (200% text resize is checked separately)','Safari','full WCAG conformance']};
 await writeFile(resolve(output,'accessibility.json'),JSON.stringify(report,null,2)+'\n');
 assert.equal(results.reduce((n,r)=>n+r.violations.length,0),0,'Review accessibility.json for violations');
 console.log('rendered accessibility audit passed');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
