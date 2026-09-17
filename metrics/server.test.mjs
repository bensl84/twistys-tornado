import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, ingest, summary, createServer, validateEvent, cleanup } from './server.mjs';

test('the loaded game build and service-worker cache build agree',()=>{
  const html=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'..','index.html'),'utf8');
  const worker=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'..','sw.js'),'utf8');
  const game=html.match(/name="twisty-build" content="([^"]+)"/)?.[1];
  const cache=worker.match(/const BUILD = '([^']+)'/)?.[1];
  assert.ok(game);assert.equal(game,cache);
});

const build='2026-09-17-twister-v13-metrics-local';
const today=new Date().toISOString().slice(0,10);
function event(visitId,runId,seq,type,stage='town',options={}) {return {schema:1,id:randomUUID(),visitId,runId,seq,type,build,day:today,elapsed:options.elapsed||0,stage:type==='load'?null:stage,tier:type==='load'?null:options.tier||1,partial:options.partial||false};}
function fixture(){const dir=mkdtempSync(join(tmpdir(),'twisty-metrics-'));const db=openStore(join(dir,'test.sqlite'));return {db,done(){db.close();rmSync(dir,{recursive:true,force:true});}};}

test('ten measured runs count five goals and three real replays, once each',()=>{
  const f=fixture();try {
    const all=[];
    for(let i=0;i<10;i++){
      const visit=randomUUID(),run=randomUUID();let seq=1;
      all.push(event(visit,null,seq++,'load'));
      all.push(event(visit,run,seq++,'run_start'));
      all.push(event(visit,run,seq++,'stage'));
      all.push(event(visit,run,seq++,'first_absorb'));
      if(i<5){for(const stage of ['town','solar','galaxy','universe']){all.push(event(visit,run,seq++,'goal',stage));if(stage!=='universe')all.push(event(visit,run,seq++,'stage',({town:'solar',solar:'galaxy',galaxy:'universe'})[stage]));}all.push(event(visit,run,seq++,'results','universe'));}
      if(i<3){all.push(event(visit,run,seq++,'replay_click','town'));const replay=randomUUID();all.push(event(visit,replay,seq++,'run_start'));all.push(event(visit,replay,seq++,'replay_start'));}
    }
    const before=all.map(x=>x.id);ingest(f.db,all.slice(0,64));ingest(f.db,all.slice(64));ingest(f.db,all.slice(0,64));
    const s=summary(f.db);assert.equal(s.recent.starts,13);assert.equal(s.recent.finalGoals,5);assert.equal(s.recent.results,5);assert.equal(s.recent.replayClicks,3);assert.equal(s.recent.actualReplays,3);assert.equal(s.recent.eligibleLoads,10);assert.deepEqual(all.map(x=>x.id),before);
  } finally{f.done();}
});

test('strict event schema, time bounds and privacy fields',()=>{
  const v=randomUUID(),r=randomUUID();const e=event(v,r,1,'run_start');
  assert.equal(validateEvent(e),true);
  assert.equal(validateEvent({...e,email:'child@example.com'}),false);
  assert.equal(validateEvent({...e,day:'2020-01-01'}),false);
  assert.equal(validateEvent({...e,elapsed:Infinity}),false);
  assert.equal(validateEvent({...e,runId:null}),false);
});

test('a goal delivered the next day belongs to its original run cohort',()=>{
  const f=fixture();try{
    const visit=randomUUID(),run=randomUUID(),yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
    const start=event(visit,run,1,'run_start');start.day=yesterday;
    const goal=event(visit,run,2,'goal','universe');
    ingest(f.db,[goal,start]);
    const rows=summary(f.db).daily;
    assert.equal(rows.find(x=>x.day===yesterday).goal_universe,1);
    assert.equal(rows.some(x=>x.day===today&&x.goal_universe>0),false);
  }finally{f.done();}
});

test('admin read is private, origin is restricted and server kill switch stops ingestion',async()=>{
  const f=fixture();const app=createServer({db:f.db,allowedOrigins:['http://127.0.0.1:8000'],adminUser:'ben',adminPassword:'secret'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+app.server.address().port;
  try{
    const e=event(randomUUID(),randomUUID(),1,'run_start');const payload=JSON.stringify({events:[e]});
    let res=await fetch(url+'/api/summary');assert.equal(res.status,401);
    res=await fetch(url+'/v1/events',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:payload});assert.equal(res.status,403);
    res=await fetch(url+'/v1/events',{method:'POST',headers:{Origin:'http://127.0.0.1:8000','Content-Type':'application/json'},body:payload});assert.equal(res.status,200);assert.deepEqual((await res.json()).acked,[e.id]);
    res=await fetch(url+'/api/summary',{headers:{Authorization:'Basic '+Buffer.from('ben:secret').toString('base64')}});assert.equal(res.status,200);assert.equal((await res.json()).recent.starts,1);
    res=await fetch(url+'/api/collection',{method:'POST',headers:{Authorization:'Basic '+Buffer.from('ben:secret').toString('base64')}});assert.equal(res.status,200);assert.equal((await res.json()).collecting,false);
    res=await fetch(url+'/v1/events',{method:'POST',headers:{Origin:'http://127.0.0.1:8000','Content-Type':'application/json'},body:payload});assert.equal(res.status,503);
  }finally{await new Promise(resolve=>app.server.close(resolve));f.done();}
});

test('raw identifiers expire while daily totals remain, then totals expire',()=>{
  const f=fixture();try{
    const now=Date.now(),old=new Date(now-16*86400000).toISOString().slice(0,10);
    const start=event(randomUUID(),randomUUID(),1,'run_start');start.day=old;
    // Insert an old validated row directly to exercise scheduled retention.
    f.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(start.id,start.visitId,start.runId,start.seq,start.type,start.build,start.day,start.elapsed,start.stage,start.tier,0,now-16*86400000);
    cleanup(f.db,now);assert.equal(f.db.prepare('SELECT count(*) n FROM events').get().n,0);assert.equal(summary(f.db,now).daily.find(x=>x.day===old).run_start,1);
    cleanup(f.db,now+100*86400000);assert.equal(f.db.prepare('SELECT count(*) n FROM daily_rollups').get().n,0);
  }finally{f.done();}
});

test('retention retires a whole run, merges rollups, and ignores later orphan milestones',()=>{
  const f=fixture();try{
    const now=Date.now(),old=new Date(now-16*86400000).toISOString().slice(0,10);
    const insert=f.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    for(let i=0;i<2;i++){
      const visit=randomUUID(),run=randomUUID();
      const start=event(visit,run,1,'run_start');start.day=old;
      insert.run(start.id,start.visitId,start.runId,start.seq,start.type,start.build,start.day,start.elapsed,start.stage,start.tier,0,now-16*86400000);
      const goal=event(visit,run,2,'goal','universe');
      insert.run(goal.id,goal.visitId,goal.runId,goal.seq,goal.type,goal.build,goal.day,goal.elapsed,goal.stage,goal.tier,0,now-13*86400000);
      cleanup(f.db,now);
      assert.equal(f.db.prepare('SELECT count(*) n FROM events').get().n,0);
      const row=summary(f.db,now).daily.find(x=>x.day===old);
      assert.equal(row.run_start,i+1);assert.equal(row.goal_universe,i+1);
      assert.equal(summary(f.db,now).daily.some(x=>x.day===today&&x.goal_universe>0),false);
      const late=event(visit,run,3,'results','universe');
      ingest(f.db,[late],now);
      assert.equal(f.db.prepare('SELECT count(*) n FROM events').get().n,0);
    }
  }finally{f.done();}
});

test('server startup enforces retention before any dashboard read',async()=>{
  const f=fixture();try{
    const now=Date.now(),start=event(randomUUID(),randomUUID(),1,'run_start');
    start.day=new Date(now-16*86400000).toISOString().slice(0,10);
    f.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(start.id,start.visitId,start.runId,start.seq,start.type,start.build,start.day,start.elapsed,start.stage,start.tier,0,now-16*86400000);
    const app=createServer({db:f.db,allowedOrigins:['http://127.0.0.1:8000'],adminUser:'ben',adminPassword:'secret',now:()=>now});
    assert.equal(f.db.prepare('SELECT count(*) n FROM events').get().n,0);
    await new Promise(resolve=>{app.server.listen(0,'127.0.0.1',()=>app.server.close(resolve));});
  }finally{f.done();}
});
