// Render a private dashboard screenshot from the synthetic demo only.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, createServer } from './server.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const path=join(root,'metrics','demo.sqlite'),output=join(root,'docs','metrics-dashboard-preview.png');
if(!existsSync(path))throw new Error('Run node metrics/demo.mjs first.');
if(existsSync(output))throw new Error('Preview image already exists; preserve or rename it before generating another.');
const require=createRequire(import.meta.url),playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');
const db=openStore(path),password=randomUUID();
const app=createServer({db,allowedOrigins:['http://127.0.0.1:8000'],adminUser:'preview',adminPassword:password,dataLabel:'SYNTHETIC DEMO — NOT REAL PLAYERS'});
let browser;
try{
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  browser=await playwright.chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:960},deviceScaleFactor:1,httpCredentials:{username:'preview',password}});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:'+app.server.address().port+'/');
  await page.waitForFunction(()=>document.getElementById('dataset')?.textContent?.startsWith('SYNTHETIC'));
  await page.screenshot({path:output,fullPage:true});
  console.log('Synthetic preview: '+output);
  await context.close();
}finally{if(browser)await browser.close();await new Promise(resolve=>app.server.close(resolve));db.close();}
