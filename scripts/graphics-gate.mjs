#!/usr/bin/env node
// Local browser graphics gate. Never substitutes for the target-iPad or human visual-acceptance gates.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const require=createRequire(import.meta.url),args=process.argv.slice(2);
const opt=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(opt('output',mkdtempSync(join(tmpdir(),'twisty-graphics-'))));mkdirSync(output,{recursive:true});
const seconds=Number(opt('seconds',10));if(!Number.isFinite(seconds)||seconds<5)throw new Error('--seconds must be at least 5');
let playwright;for(const candidate of ['playwright',process.env.PLAYWRIGHT_PATH].filter(Boolean)){try{playwright=require(candidate);break;}catch{}}
if(!playwright)throw new Error('Set PLAYWRIGHT_PATH or install Playwright separately; this gate never installs dependencies.');
const executable=opt('executable',process.env.BROWSER_EXECUTABLE);
const report={sourceSHA256:createHash('sha256').update(readFileSync(join(root,'index.html'))).digest('hex'),observedAt:new Date().toISOString(),scope:'local-browser',browserPath:'regular Playwright; Browser plugin not available',secondsPerStage:seconds,checks:[],performance:[],screenshots:[],releaseReady:false,targetIPad:'NOT_PROVEN',humanVisualAcceptance:'NOT_PROVEN'};
const check=(name,pass,evidence)=>{report.checks.push({name,pass,evidence});console.log(pass?'PASS':'FAIL',name,JSON.stringify(evidence));};
const browser=await playwright.chromium.launch(executable?{executablePath:executable}:{});
try{
 const context=await browser.newContext({viewport:{width:1180,height:820},deviceScaleFactor:2,hasTouch:true,offline:true});
 const page=await context.newPage(),errors=[];let network=0;
 await context.route('**/*',route=>{if(route.request().url().startsWith('file:'))return route.continue();network++;return route.abort();});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(pathToFileURL(join(root,'index.html')).href);await page.waitForFunction(()=>window.__app?.R);
 check('page identity and first meaningful screen',await page.title()==='Twister'&&await page.locator('[data-color]').count()===5,page.url());
 report.userAgent=await page.evaluate(()=>navigator.userAgent);
 const settings=()=>page.evaluate(()=>({antialias:__app.R.renderer.getContext().getContextAttributes().antialias,dpr:__app.R.renderer.getPixelRatio(),width:document.getElementById('c').width,height:document.getElementById('c').height,cssWidth:innerWidth,cssHeight:innerHeight,contextLost:__app.R.renderer.getContext().isContextLost()}));
 const retina=await settings();check('actual antialiasing and 2x backing resolution',retina.antialias&&retina.dpr===2&&Math.abs(retina.width-retina.cssWidth*2)<=1&&Math.abs(retina.height-retina.cssHeight*2)<=1,retina);
 await page.locator('[data-color="blue"]').tap({force:true});
 const cdp=await context.newCDPSession(page),start=await page.evaluate(()=>({...__app.G.pos}));
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:590,y:450}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:850,y:380}]});
 await page.waitForFunction(p=>Math.hypot(__app.G.pos.x-p.x,__app.G.pos.z-p.z)>.1,start);
 const latency=await page.evaluate(()=>__app.G.lastResponseTick-__app.G.lastInputTick);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 check('real touch responds within 2 logic frames and releases',latency>=0&&latency<=2&&!await page.evaluate(()=>__app.G.finger.down),{latency});
 await page.evaluate(()=>{__app.running=false;cancelAnimationFrame(__app.raf);document.getElementById('rotate').classList.add('hidden');});
 for(const view of ['town-start','town-close','town-wide','solar','galaxy','universe']){
  await page.evaluate(view=>{
   const stage=view.startsWith('town')?'town':view;__app.G.seed=1;__jumpStage(stage);const G=__app.G,R=__app.R;G.tick=120;G.shake=0;G.fovPunch=0;
   if(view==='town-close'){G.power=2.8;G.pos.x=0;G.pos.z=-9;}
   if(view==='town-wide'){G.power=12;G.pos.x=0;G.pos.z=-9;G.camDist=80;}
   G.overview=stage!=='town';R.update(G,0);
   if(view==='town-close'){R.camera.position.set(25,26,35);R.camera.lookAt(-1,5,-15);R.camera.updateMatrixWorld();}
   if(view==='town-wide'){R.camera.position.set(80,140,160);R.camera.lookAt(0,0,-30);R.camera.updateMatrixWorld();}
   R.render();
  },view);
  const path=join(output,view+'.png');await page.screenshot({path});report.screenshots.push({view,path,viewport:'1180x820',dpr:2,seed:1,tick:120});
  if(view==='town-start'){
   const render=await page.evaluate(()=>({...__app.R.renderer.info.render}));
   check('reference town geometry budget',render.triangles>0&&render.triangles<=2500000&&render.calls>0&&render.calls<=100,render);
  }
 }
 await page.setViewportSize({width:820,height:1180});await page.evaluate(()=>{__jumpStage('town');__app.R.update(__app.G,0);__app.R.render();});
 const portrait=await settings();check('portrait backing dimensions and no failure overlay',portrait.width===1640&&portrait.height===2360&&!await page.locator('#fail').isVisible(),portrait);
 const portraitPath=join(output,'town-portrait.png');await page.screenshot({path:portraitPath});report.screenshots.push({view:'town-portrait',path:portraitPath,viewport:'820x1180',dpr:2,seed:1});
 await page.setViewportSize({width:1180,height:820});
 const cycles=[];
 for(let cycle=0;cycle<3;cycle++){
  const memory={};for(const stage of ['town','solar','galaxy','universe']){memory[stage]=await page.evaluate(stage=>{__jumpStage(stage);__app.R.update(__app.G,0);__app.R.render();return {...__app.R.renderer.info.memory};},stage);}cycles.push(memory);
 }
 check('GPU resource counts stabilize across stage cycles',JSON.stringify(cycles[1])===JSON.stringify(cycles[2]),cycles);
 await page.evaluate(()=>{__jumpStage('town');__startLive();});
 for(const stage of ['town','solar','galaxy','universe']){
  await page.evaluate(stage=>{__jumpStage(stage);const G=__app.G;G.power=stage==='town'?12:240;G.tier=stage==='town'?5:4;},stage);await page.waitForFunction(()=>__app.G.time>2);
  const performance=await page.evaluate(seconds=>new Promise(resolve=>{
   const intervals=[],startTick=__app.G.tick,startRender=__app.R.renderer.info.render.frame;let start=performance.now(),last=start;
   function sample(now){intervals.push(now-last);last=now;if(now-start<seconds*1000)return requestAnimationFrame(sample);
    intervals.shift();const mean=intervals.reduce((s,x)=>s+x,0)/intervals.length;intervals.sort((a,b)=>a-b);
    const render=__app.R.renderer.info.render;
    resolve({fpsMean:1000/mean,p99FrameMs:intervals[Math.min(intervals.length-1,Math.ceil(intervals.length*.99)-1)],frames:intervals.length,gameTicks:__app.G.tick-startTick,renderedFrames:render.frame-startRender,contextLost:__app.R.renderer.getContext().isContextLost(),triangles:render.triangles,drawCalls:render.calls,actualStage:__app.G.stage});
   }requestAnimationFrame(sample);
  }),seconds);
  report.performance.push({stage,...performance});check(stage+' stationary grown-scene smoke gate',performance.fpsMean>=50&&performance.p99FrameMs<33&&!performance.contextLost&&performance.actualStage===stage&&performance.gameTicks>=seconds*50&&performance.renderedFrames>=performance.frames*.95&&performance.triangles>0&&performance.drawCalls>0,performance);
  const playPath=join(output,stage+'-play.png');await page.screenshot({path:playPath});report.screenshots.push({view:stage+'-play',path:playPath,viewport:'1180x820',dpr:2,fixture:'live stationary grown scene; tick varies'});
 }
 await page.evaluate(()=>__finishStage());await page.waitForFunction(()=>__app.G.stage==='town'&&!__app.finale&&__fade()===0,null,{timeout:30000});
 check('live finale returns to town with space controls hidden',!await page.locator('#space-map').isVisible(),await page.evaluate(()=>__state()));
 check('end-of-run summary pauses the new town',await page.locator('#results').isVisible()&&await page.evaluate(()=>__app.resultsOpen&&__app.G.tick===0),await page.evaluate(()=>__app.completedRun));
 await page.locator('#play-again').tap();await page.waitForFunction(()=>!__app.resultsOpen&&__app.G.tick>3);
 check('Play again starts a fresh run',await page.evaluate(()=>__app.run.seconds.blackhole===0&&__app.run.stages.town.consumedMass===0),await page.evaluate(()=>__app.run.seconds));
 const context1=await browser.newContext({viewport:{width:1180,height:820},deviceScaleFactor:1,offline:true});
 await context1.route('**/*',route=>{if(route.request().url().startsWith('file:'))return route.continue();network++;return route.abort();});
 const page1=await context1.newPage();page1.on('pageerror',e=>errors.push(e.message));page1.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page1.goto(pathToFileURL(join(root,'index.html')).href);await page1.waitForFunction(()=>window.__app?.R);
 const low=await page1.evaluate(()=>({dpr:__app.R.renderer.getPixelRatio(),width:document.getElementById('c').width,antialias:__app.R.renderer.getContext().getContextAttributes().antialias}));check('1x displays retain antialiasing without forced supersampling',low.dpr===1&&low.width===1180&&low.antialias,low);await context1.close();
 check('zero runtime errors and offline network requests',errors.length===0&&network===0,{errors,network});
}catch(error){check('gate execution completed',false,String(error.stack||error));}
finally{await browser.close();report.localPassed=report.checks.every(x=>x.pass);writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log('Report:',join(output,'report.json'));console.log(report.localPassed?'LOCAL GRAPHICS GATES PASS; iPad and human approval remain separate':'LOCAL GRAPHICS GATES FAILED');process.exitCode=report.localPassed?0:1;}
