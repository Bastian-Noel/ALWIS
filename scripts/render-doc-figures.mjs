/** Export the editable SVG figures as crisp PNG assets for GitHub Wiki. */
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(process.argv[2]??fileURLToPath(new URL('../',import.meta.url)));
const {chromium}=await import(new URL('../build-work/php/node_modules/playwright/index.mjs',import.meta.url));
const target=resolve(root,'docs/images/figures');await mkdir(target,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const reports=[];
try {
 const page=await browser.newPage({viewport:{width:1200,height:760},deviceScaleFactor:2});
 for(const file of (await readdir(resolve(root,'docs/figures'))).filter(x=>x.endsWith('.svg')).sort()){
  const svg=await readFile(resolve(root,'docs/figures',file),'utf8');
  await page.setContent('<style>body{margin:0;background:white}svg{display:block}</style>'+svg);
  await page.evaluate(()=>document.fonts.ready);
  const overflow=await page.locator('svg text').evaluateAll(nodes=>nodes.filter(n=>{const b=n.getBBox();return b.x<0||b.y<0||b.x+b.width>1200||b.y+b.height>760;}).map(n=>n.textContent));
  if(overflow.length)throw Error(file+' text outside figure: '+JSON.stringify(overflow));
  await page.locator('svg').screenshot({path:resolve(target,file.replace('.svg','.png'))});
  reports.push({file,textElements:await page.locator('svg text').count(),overflow});
 }
 await mkdir(resolve(root,'work'),{recursive:true});
 await writeFile(resolve(root,'work/doc-figure-render.json'),JSON.stringify(reports,null,2)+'\n');
 console.log('Exported and checked',reports.length,'figures at 2x resolution');
} finally {await browser.close();}
