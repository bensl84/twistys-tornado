import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { openStore, createServer, summary } from './server.mjs';

const require=createRequire(import.meta.url);
const playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('actual browser counts first input, finale and actual replay', {timeout:90000}, async()=>{
  const dir=mkdtempSync(join(tmpdir(),'twisty-browser-'));
  const db=openStore(join(dir,'test.sqlite'));
  const metrics=createServer({db,allowedOrigins:['http://127.0.0.1:8000'],adminUser:'ben',adminPassword:'secret'});
  const files={'/':'index.html','/index.html':'index.html','/metrics-config.js':'metrics-config.js','/metrics-client.js':'metrics-client.js','/sw.js':'sw.js','/manifest.webmanifest':'manifest.webmanifest'};
  const web=http.createServer((req,res)=>{const file=files[new URL(req.url,'http://localhost').pathname];if(!file){res.writeHead(404);res.end();return;}const kind=file.endsWith('.js')?'text/javascript':file.endsWith('.webmanifest')?'application/manifest+json':'text/html';res.writeHead(200,{'Content-Type':kind});res.end(readFileSync(join(root,file)));});
  let browser;
  try{
    await Promise.all([new Promise(resolve=>metrics.server.listen(8787,'127.0.0.1',resolve)),new Promise(resolve=>web.listen(8000,'127.0.0.1',resolve))]);
    browser=await playwright.chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const context=await browser.newContext({viewport:{width:1000,height:700}});
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:8000/');
    await page.waitForFunction(()=>window.__app?.G && window.TwistyMetrics);
    assert.equal(summary(db).recent.starts,0);
    await page.locator('#metrics-parent-open').click();
    await page.locator('#metrics-parent-check').check();
    assert.equal(await page.locator('#start').isVisible(),true,'parent settings must not start the game');
    await page.locator('[data-color="blue"]').click({force:true});
    await page.waitForFunction(()=>window.__app.running);
    await wait(300);
    assert.equal(summary(db).recent.starts,0,'color choice is not a run start');
    await page.locator('canvas').click({position:{x:450,y:350}});
    await page.waitForFunction(()=>window.__state().lastInputTick>=0);
    await wait(500);
    assert.equal(summary(db).recent.starts,1);
    await page.evaluate(()=>{window.__TUNING.FINALE_ZOOM_S=0.1;window.__TUNING.FINALE_DARK_S=0.1;window.__TUNING.FINALE_FLASH_S=0.1;window.__app.R.render=()=>{};});
    for(const stage of ['town','solar','galaxy','universe']){
      await page.evaluate(()=>window.__finishStage());
      if(stage!=='universe')await page.evaluate(()=>window.__nextStage());
    }
    await page.evaluate(()=>{window.__app.G.winT=-10;});
    await page.waitForFunction(()=>window.__app.resultsOpen,null,{timeout:20000});
    await wait(500);
    let s=summary(db);assert.equal(s.recent.finalGoals,1);assert.equal(s.recent.results,1);assert.equal(s.recent.starts,1,'finale-created town is not a replay');
    await page.locator('#play-again').click();
    await wait(300);s=summary(db);assert.equal(s.recent.replayClicks,1);assert.equal(s.recent.actualReplays,0);
    await page.locator('canvas').click({position:{x:450,y:350}});
    await wait(500);s=summary(db);assert.equal(s.recent.starts,2);assert.equal(s.recent.actualReplays,1);
    await context.route('**/v1/events',route=>route.abort());
    await page.evaluate(()=>window.TwistyMetrics.gameEvent({kind:'tierup'},window.__app.G));
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('twisty-metrics-pending-v1')||'[]').some(x=>x.event.type==='tier'));
    assert.equal(db.prepare("SELECT count(*) n FROM events WHERE type='tier'").get().n,0,'outage queues instead of blocking play');
    await context.unroute('**/v1/events');
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('twisty-metrics-pending-v1')||'[]').length===0,null,{timeout:10000});
    assert.equal(db.prepare("SELECT count(*) n FROM events WHERE type='tier'").get().n,1);
    await context.route('**/v1/events',route=>route.abort());
    await page.evaluate(()=>window.TwistyMetrics.gameEvent({kind:'tierup'},window.__app.G));
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('twisty-metrics-pending-v1')||'[]').length>0);
    await page.evaluate(()=>window.TwistyMetrics.setPreference(false));
    assert.equal(await page.evaluate(()=>localStorage.getItem('twisty-metrics-pending-v1')),null,'opt-out clears pending play data');
    assert.equal(await page.evaluate(()=>window.__app.running),true,'collection changes never stop gameplay');
    await page.evaluate(()=>{localStorage.setItem('twisty-metrics-preference-v1','yes:pilot-1');localStorage.setItem('twisty-metrics-pending-v1',JSON.stringify([{event:{id:'stale'},queuedAt:Date.now()-8*86400000}]));});
    await page.reload();
    await page.waitForFunction(()=>window.TwistyMetrics?.enabled);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('twisty-metrics-pending-v1')||'[]').some(x=>x.event.id==='stale')),false,'old offline queue records expire');
    await context.route('**/v1/events',route=>route.abort());
    await page.locator('[data-color="blue"]').click({force:true});
    await page.waitForFunction(()=>window.__app.running);
    await page.locator('canvas').click({position:{x:450,y:350}});
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('twisty-metrics-pending-v1')||'[]').some(x=>x.event.type==='run_start'));
    await page.evaluate(()=>{for(let i=0;i<4000;i++)window.TwistyMetrics.tick(1,'town',1);});
    const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('twisty-metrics-pending-v1')||'[]').map(x=>x.event));
    assert.ok(pending.length<=100,'offline queue stays bounded');
    assert.ok(pending.some(x=>x.type==='run_start'),'queue pressure preserves the run anchor');
    await context.close();
  }finally{
    if(browser)await browser.close();
    await Promise.all([new Promise(resolve=>web.close(resolve)),new Promise(resolve=>metrics.server.close(resolve))]);
    db.close();rmSync(dir,{recursive:true,force:true});
  }
});
