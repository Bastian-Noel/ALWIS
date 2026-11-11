/** Real workbench regression: popups, network order, shared schema, badges and checkpoint feedback. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium, firefox } from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
import { createCollabHub } from "../../server/collab-hub.mjs";
const server = createStudioServer({ engineDist: process.env.ALWIS_INTERACTION_ENGINE }), handler = server.listeners("request")[0];
const hub = createCollabHub();
let origin;
server.removeAllListeners("request");
server.on("request", async (req, res) => {
  const p = new URL(req.url, "http://localhost").pathname;
  if (p === "/api/collab/config") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ...hub.publicConfig(), path: "/collab", iceServers: [], relayAcknowledgements: true,
      guestPreviewEnabled: true, previewRequiresTrust: true, previewOrigin: origin })); return;
  }
  const broker = /^\/__alwis-guest\/[a-f0-9]{32}\/__broker\.html$/.test(p);
  if (broker || p === "/guest-sw.js") {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Content-Type", broker ? "text/html" : "text/javascript");
    res.end(broker ? '<!doctype html><script type="module" src="/apps/studio/collab/isolated-preview-broker.mjs"></script>'
      : await readFile(new URL("../../apps/studio/collab/isolated-preview-sw.mjs", import.meta.url))); return;
  }
  handler(req, res);
});
server.on("upgrade", (req, socket, head) => hub.handleUpgrade(req, socket, head));
await new Promise(r => server.listen(0, "127.0.0.1", r));
origin = "http://127.0.0.1:" + server.address().port;
await mkdir("build-work/studio-interactions", { recursive: true });
const state = async (page, fn, arg) => page.evaluate(async ({ source, arg }) => {
  const mod = await import("/apps/studio/workbench/state.mjs");
  return (0, eval)("(" + source + ")")(mod, arg);
}, { source: fn.toString(), arg });
const reports = [];
try {
 for (const [name, type] of [["chromium",chromium],["firefox",firefox]]) {
  if (process.argv[2] && !process.argv[2].split(",").includes(name)) continue;
  const browser = await type.launch({ headless: true, ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}) });
  try {
   const contexts = [await browser.newContext(), await browser.newContext(), await browser.newContext()];
   const [host,guest,late] = await Promise.all(contexts.map(c => c.newPage()));
   const errors=[];
   for (const page of [host,guest,late]) {
    page.setDefaultTimeout(90000); page.on("pageerror",e=>errors.push(e.message));
    page.on("dialog", d => d.accept());
   }
   await host.goto(origin); await host.locator('#stext').filter({hasText:'Prêt'}).waitFor();
   await host.locator('#pn').fill('interactions-'+name); await host.locator('input[value=demo]').check();
   await host.locator('[data-act=create]').click(); await host.locator('#ed1 .cm-content').waitFor();
   await state(host, async ({A}) => { await A.runFile('/index.php'); await A.nav('schema'); });
   await host.locator('[data-drag="students"]').waitFor();
   await host.getByRole('button',{name:'Travailler à plusieurs',exact:true}).click();
   await host.locator('#cbName').fill('Owner'); await host.locator('.cb-pop button.btn.pri').click();
   await host.waitForFunction(async()=> (await import('/apps/studio/collab/index.mjs')).collab.session?.status==='live');
   const room = await host.evaluate(async()=> (await import('/apps/studio/collab/index.mjs')).collab.session.room);
   const join = async (page,name) => {
    await page.goto(origin+'/?collab='+room); await page.locator('#cbJoinName').fill(name);
    await page.getByRole('button',{name:'Rejoindre le projet',exact:true}).click();
    await page.locator('html[data-collab-guest]').waitFor();
    await page.locator('#ed1 .cm-content').waitFor();
    await page.waitForFunction(()=>document.documentElement.hasAttribute('data-guest-http-preview'));
   };
   await join(guest,'Guest');console.log(name+': guest joined');
   await state(guest, async ({A})=>A.nav('schema'));
   // Real pointer drag beyond the original nonnegative world bounds.
   await state(host, ({S,ctx})=>{S.pan=[460,350];S.zoom=1;ctx.draw();});
   const table=host.locator('[data-drag="students"]');
   // Put a known starting position through the normal keyboard action before the drag.
   await state(host, ({S,ctx})=>{S.pos.students=[0,0];ctx.draw();});
   const rect=await table.boundingBox(); assert.ok(rect);
   await host.mouse.move(rect.x+70,rect.y+18); await host.mouse.down();
   await host.mouse.move(rect.x-120,rect.y-95,{steps:8});
   // Must arrive while the mouse is still held, without Follow mode.
   await guest.waitForFunction(async()=>{
    const {S}=await import('/apps/studio/workbench/state.mjs');return S.pos.students?.[0]<0 && S.pos.students?.[1]<0;
   });
   await host.mouse.up();
   const moved=await state(host,({S})=>[...S.pos.students]);
   await guest.waitForFunction(async pos=>JSON.stringify((await import('/apps/studio/workbench/state.mjs')).S.pos.students)===JSON.stringify(pos),moved);
   // Independent viewport: receiving placement must not make every guest follow the host.
   const guestPan=await state(guest,({S})=>[...S.pan]);
   assert.notDeepEqual(guestPan,await state(host,({S})=>S.pan));
   // An edge drag keeps travelling rather than stopping at the canvas boundary.
   await state(host,({S,ctx})=>{S.pos.students=[0,0];S.pan=[300,180];ctx.draw();});
   const edge=await table.boundingBox(), canvas=await host.locator('#sv').boundingBox();
   await host.mouse.move(edge.x+70,edge.y+18);await host.mouse.down();
   await host.mouse.move(canvas.x+3,canvas.y+3,{steps:8});
   const beforeEdge=await state(host,({S})=>[...S.pos.students]);
   await host.waitForFunction(async before=>{
    const {S}=await import('/apps/studio/workbench/state.mjs');return S.pos.students[0]<before[0]-80 && S.pos.students[1]<before[1]-80;
   },beforeEdge);
   await host.mouse.up();
   // Guest-origin movement reaches the owner and a late joining participant.
   const gtable=guest.locator('[data-drag="students"]');await gtable.focus();await gtable.press('ArrowLeft');
   const final=await state(guest,({S})=>[...S.pos.students]);
   await host.waitForFunction(async p=>JSON.stringify((await import('/apps/studio/workbench/state.mjs')).S.pos.students)===JSON.stringify(p),final);
   console.log(name+': live and edge placement passed');await join(late,'Late');await state(late,async({A})=>A.nav('schema'));
   await late.waitForFunction(async p=>JSON.stringify((await import('/apps/studio/workbench/state.mjs')).S.pos.students)===JSON.stringify(p),final);
   // Explorer badges move to collapsed parent folders and back to the visible file.
   await state(host,async({A})=>A.nav('code'));await state(guest,async({A})=>{await A.nav('code');await A.openFile('/lib/bootstrap.php');});
   await host.locator('#tree [data-path="/lib/bootstrap.php"] .cb-av').waitFor();
   await host.locator('#tree [data-path="/lib"]').click();
   await host.locator('#tree [data-path="/lib"][aria-expanded="false"] .cb-av').waitFor();
   await host.locator('#tree [data-path="/lib"]').click();
   await host.locator('#tree [data-path="/lib/bootstrap.php"] .cb-av').waitFor();
   console.log(name+': badges and late joining passed');
   // Both popup paths use their role-specific HTTP preview, never a guest's null local hub.
   for(const page of [host,guest]) {
    await state(page,async({A})=>{await A.openFile('/index.php');await A.runFile('/index.php');});
    const event=page.waitForEvent('popup');await page.locator('[data-act="openWindow"]').click();const popup=await event;
    await popup.waitForURL(url=>url.pathname.includes(page===host?'/__pbl/':'/__alwis-guest/'));
    try { await popup.getByText('Campus des Tilleuls',{exact:true}).waitFor(); }
    catch(error) {
      const diagnostic={browser:name,role:page===host?'host':'guest',url:popup.url(),body:await popup.locator('body').innerText().catch(()=>''),logs:await state(page,({S})=>S.logs.slice(-12))};
      console.error('Popup diagnostic:',JSON.stringify(diagnostic));
      await writeFile('build-work/studio-interactions/popup-failure-'+name+'.json',JSON.stringify(diagnostic,null,2));
      throw error;
    }
    await popup.close();console.log(name+': '+(page===host?'host':'guest')+' popup passed');
   }
   // Latest completed record is first without mutating chronological storage or selection.
   await state(host,({A})=>A.networkToggle());
   const newest=await state(host,({S})=>S.reqs.at(-1).id);
   assert.equal(await host.locator('#networkBody [data-act="networkSelect"]').first().getAttribute('data-arg'),String(newest));
   await host.locator('#networkBody [data-act="networkSelect"]').first().click();
   assert.equal(await state(host,({S})=>S.networkSelected),String(newest));
   // Hold the real save boundary to observe feedback, then perform the actual checkpoint.
   await state(host,({ctx})=>{
    const save=ctx.engine.projects.save.bind(ctx.engine.projects);
    window.releaseSave=null;
    ctx.engine.projects.save=async()=>{await new Promise(r=>window.releaseSave=r);return save();};
   });
   console.log(name+': network passed');await host.locator('#primary').click();
   await host.waitForFunction(()=>typeof window.releaseSave==='function');
   assert.equal(await host.locator('#primary').isDisabled(),true);
   assert.equal(await host.locator('#primary').getAttribute('aria-busy'),'true');
   assert.match(await host.locator('#primary').innerText(),/Enregistrement/);
   await host.screenshot({path:'build-work/studio-interactions/saving-'+name+'.png'});
   await host.evaluate(()=>window.releaseSave());await host.locator('#primary[aria-busy="false"]').waitFor();
   assert.equal(await state(host,({S})=>S.saveFail),false);
   await host.evaluate(async()=> (await import('/apps/studio/collab/index.mjs')).collab.session.leave());
   await host.reload();await host.locator('#stext').filter({hasText:'Prêt'}).waitFor();
   await state(host,async({A},browser)=>{await A.open('interactions-'+browser);await A.nav('schema');},name);
   assert.deepEqual(await state(host,({S})=>S.pos.students),final,'saved placement survives actual project reopening');
   await state(host,async({A},browser)=>{await A.close();await A.open('fresh-'+browser,'demo');await A.nav('schema');},name);
   assert.notDeepEqual(await state(host,({S})=>S.pos.students),final,'a new project must not inherit another project’s placement');
   assert.deepEqual(errors,[]);
   reports.push({browser:name,popup:true,newestFirst:true,liveSchema:true,negativeCoordinates:true,edgePan:true,lateJoin:true,folderPresence:true,saveFeedback:true,reopen:true});
   await writeFile('build-work/studio-interactions/results.json',JSON.stringify(reports,null,2)+'\n');
   console.log(name+': all studio interaction regressions passed');
  } finally {await browser.close();}
 }
} finally {hub.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
