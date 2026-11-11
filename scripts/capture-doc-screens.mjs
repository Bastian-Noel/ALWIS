/** Real public Studio screenshots, in a disposable browser context. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(new URL('../build-work/php/node_modules/playwright/index.mjs',import.meta.url));
const target=resolve(process.argv[2]??repo,'docs/images');await mkdir(target,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const records=[];
try {
 const page=await browser.newPage({viewport:{width:1500,height:1000},reducedMotion:'reduce'});
 page.setDefaultTimeout(90000);
 await page.goto('https://studio.mmi.place/');
 await page.locator('#stext').filter({hasText:'Prêt'}).waitFor();
 const revision=await page.locator('meta[name="alwis-build"]').getAttribute('content');
 const state=`/_alwis/${revision}/apps/studio/workbench/state.mjs`;
 const action=(name,...args)=>page.evaluate(async ({state,name,args})=>{const {A}=await import(state);return A[name](...args);},{state,name,args});
 const shot=async name=>{await page.locator('.toast-x').evaluateAll(nodes=>nodes.forEach(node=>node.click()));await page.locator('.toast-item').first().waitFor({state:'hidden'});await page.screenshot({path:resolve(target,name+'.png')});records.push({file:name+'.png',revision,viewport:page.viewportSize()});console.log(name);};
 const theme=async value=>page.evaluate(value=>document.documentElement.dataset.theme=value,value);
 await theme('light');await shot('alwis-start');await theme('dark');await shot('alwis-start-dark');await theme('light');
 await page.setViewportSize({width:390,height:844});await shot('alwis-mobile');await page.setViewportSize({width:1500,height:1000});
 await page.locator('#pn').fill('campus-demonstration');await page.locator('input[value=demo]').check();await page.locator('[data-act=create]').click();
 await page.locator('#ed1 .cm-content').waitFor();await page.locator('.project-loading').waitFor({state:'hidden'});
 await action('runFile','/index.php');
 await page.frameLocator('iframe[title="Aperçu 1"]').getByText('Campus des Tilleuls',{exact:true}).waitFor();
 await shot('alwis-code-light');await theme('dark');await shot('alwis-code-dark');await theme('light');
 await action('nav','data');await action('selectDb','school');await action('selectTable','students');await shot('alwis-data-light');
 await theme('dark');await shot('alwis-data-dark');await theme('light');
 await action('dmode','struct');await shot('alwis-structure');
 await action('nav','schema');await action('schemaLayout');await shot('alwis-schema-light');await theme('dark');await shot('alwis-schema-dark');await theme('light');
 await action('nav','sessions');await shot('alwis-sessions');
 await action('nav','data');
 await page.evaluate(async state=>{const {sql}=await import(state);await sql("CREATE TABLE valeurs_illustrees (id INT PRIMARY KEY, libelle VARCHAR(40), texte VARCHAR(40) NULL, montant DECIMAL(30,4), grand_entier BIGINT UNSIGNED, binaire VARBINARY(8))");await sql("INSERT INTO valeurs_illustrees VALUES (1,'Absence',NULL,12.3400,9007199254740993,UNHEX('00FF')),(2,'Texte vide','',0.0000,18446744073709551615,UNHEX('41')),(3,'Texte zéro','0',15.5000,2147483648,UNHEX('0042'))");},state);
 await action('selectTable','valeurs_illustrees');await action('dmode','data');await page.getByText('9007199254740993',{exact:true}).waitFor();await shot('alwis-values');
 await writeFile(resolve(target,'capture-metadata.json'),JSON.stringify({origin:'https://studio.mmi.place/',capturedAt:new Date().toISOString(),scope:'Real UI, isolated browser context, fictitious demonstration data; no server project was modified.',records},null,2)+'\n');
} finally {await browser.close();}
