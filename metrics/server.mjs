import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const TYPES = new Set(['load','run_start','replay_start','first_absorb','stage','tier','goal','results','replay_click','checkpoint']);
const STAGES = new Set(['town','solar','galaxy','universe']);
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUILD = /^[a-z0-9][a-z0-9-]{3,79}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ROOT = dirname(fileURLToPath(import.meta.url));
const DAY_MS = 86400000;

export function validateEvent(e, now = Date.now()) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
  const keys = Object.keys(e);
  if (keys.some(k => !['schema','id','visitId','runId','seq','type','build','day','elapsed','stage','tier','partial'].includes(k))) return false;
  if (e.schema !== 1 || !ID.test(e.id) || !ID.test(e.visitId) || !TYPES.has(e.type) || !BUILD.test(e.build)) return false;
  if ((e.type === 'load') !== (e.runId === null)) return false;
  if (e.runId !== null && !ID.test(e.runId)) return false;
  if (!Number.isInteger(e.seq) || e.seq < 1 || e.seq > 100000) return false;
  if (typeof e.day !== 'string' || !DAY.test(e.day)) return false;
  const dayMs = Date.parse(e.day + 'T00:00:00Z');
  if (!Number.isFinite(dayMs) || new Date(dayMs).toISOString().slice(0,10) !== e.day || dayMs < now - 8 * DAY_MS || dayMs > now + DAY_MS) return false;
  if (typeof e.elapsed !== 'number' || !Number.isFinite(e.elapsed) || e.elapsed < 0 || e.elapsed > 86400) return false;
  if (e.stage !== null && !STAGES.has(e.stage)) return false;
  if (e.tier !== null && (!Number.isInteger(e.tier) || e.tier < 1 || e.tier > 6)) return false;
  if (typeof e.partial !== 'boolean') return false;
  if (e.type === 'load' && (e.stage !== null || e.tier !== null)) return false;
  if (e.type !== 'load' && e.stage === null) return false;
  return true;
}

export function openStore(path) {
  mkdirSync(dirname(path), { recursive:true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, visit_id TEXT NOT NULL, run_id TEXT, seq INTEGER NOT NULL,
      type TEXT NOT NULL, build TEXT NOT NULL, day TEXT NOT NULL, elapsed REAL NOT NULL,
      stage TEXT, tier INTEGER, partial INTEGER NOT NULL, received_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS event_day_build ON events(day,build);
    CREATE INDEX IF NOT EXISTS event_run ON events(run_id);
    CREATE UNIQUE INDEX IF NOT EXISTS once_per_milestone ON events(run_id,type,stage,COALESCE(tier,-1))
      WHERE run_id IS NOT NULL AND type NOT IN ('checkpoint');
    CREATE UNIQUE INDEX IF NOT EXISTS once_per_visit_load ON events(visit_id) WHERE type='load';
    CREATE TABLE IF NOT EXISTS daily_rollups (
      day TEXT NOT NULL, build TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(day,build)
    );`);
  return db;
}

const fields = ['load','run_start','first_absorb','stage_town','stage_solar','stage_galaxy','stage_universe','goal_town','goal_solar','goal_galaxy','goal_universe','results','replay_click','replay_start','last_town','last_solar','last_galaxy','last_universe'];
function emptyDay(day,build) { return Object.assign({day,build},Object.fromEntries(fields.map(k=>[k,0]))); }
function aggregate(events) {
  const days=new Map(),runs=new Map(),loads=new Set();
  const dayRow=(day,build)=>{const key=day+'|'+build;if(!days.has(key))days.set(key,emptyDay(day,build));return days.get(key);};
  for(const e of events) {
    const visit=e.visit_id??e.visitId,run=e.run_id??e.runId;
    if(e.type==='load'&&!e.partial){dayRow(e.day,e.build).load++;loads.add(visit);}
    if(!run)continue;
    if(!runs.has(run))runs.set(run,{id:run,build:e.build,day:e.day,visit,started:false,first:false,stage:'town',stages:new Set(),goals:new Set(),results:false,replayClick:false,replayStart:false,seconds:0});
    const r=runs.get(run);
    if(e.type==='run_start'){r.started=true;r.day=e.day;r.build=e.build;r.visit=visit;}
    if(e.type==='first_absorb')r.first=true;
    if(e.type==='stage'){r.stage=e.stage;r.stages.add(e.stage);}
    if(e.type==='goal')r.goals.add(e.stage);
    if(e.type==='results')r.results=true;
    if(e.type==='replay_click')r.replayClick=true;
    if(e.type==='replay_start')r.replayStart=true;
    if(e.elapsed>r.seconds)r.seconds=e.elapsed;
  }
  const recent=[...runs.values()].filter(r=>r.started);
  for(const r of recent){const d=dayRow(r.day,r.build);d.run_start++;if(r.first)d.first_absorb++;for(const stage of r.stages)d['stage_'+stage]++;for(const stage of r.goals)d['goal_'+stage]++;if(r.results)d.results++;if(r.replayClick)d.replay_click++;if(r.replayStart)d.replay_start++;if(!r.goals.has('universe'))d['last_'+r.stage]++;}
  return {daily:[...days.values()],recent,eligibleLoads:loads.size};
}

export function cleanup(db,now=Date.now()) {
  const rawCut = now - 14 * DAY_MS;
  const rollCut = new Date(now - 90 * DAY_MS).toISOString().slice(0,10);
  // Retire an entire run with its start, so a milestone cannot outlive its cohort.
  const old = db.prepare(`SELECT * FROM events WHERE (run_id IS NULL AND received_at < ?)
    OR run_id IN (SELECT run_id FROM events WHERE type='run_start' AND received_at < ?)
    OR (run_id IS NOT NULL AND received_at < ? AND run_id NOT IN (SELECT run_id FROM events WHERE type='run_start'))
    ORDER BY day,seq`).all(rawCut,rawCut,rawCut);
  const groups = aggregate(old).daily;
  const get=db.prepare('SELECT payload FROM daily_rollups WHERE day=? AND build=?');
  const put=db.prepare('INSERT INTO daily_rollups(day,build,payload) VALUES(?,?,?) ON CONFLICT(day,build) DO UPDATE SET payload=excluded.payload');
  db.exec('BEGIN');
  try {
    for(const g of groups) {
      const prior=get.get(g.day,g.build);
      if(prior){const p=JSON.parse(prior.payload);for(const field of fields)p[field]+=g[field];put.run(g.day,g.build,JSON.stringify(p));}
      else put.run(g.day,g.build,JSON.stringify(g));
    }
    db.prepare(`DELETE FROM events WHERE (run_id IS NULL AND received_at < ?)
      OR run_id IN (SELECT run_id FROM (SELECT run_id FROM events WHERE type='run_start' AND received_at < ?))
      OR (run_id IS NOT NULL AND received_at < ? AND run_id NOT IN (SELECT run_id FROM events WHERE type='run_start'))`).run(rawCut,rawCut,rawCut);
    db.prepare('DELETE FROM daily_rollups WHERE day < ?').run(rollCut);
    db.exec('COMMIT');
    if(old.length)db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}

export function ingest(db,events,now=Date.now()) {
  if (!Array.isArray(events) || events.length < 1 || events.length > 64 || events.some(e=>!validateEvent(e,now))) throw new Error('invalid batch');
  const put=db.prepare(`INSERT OR IGNORE INTO events
    (id,visit_id,run_id,seq,type,build,day,elapsed,stage,tier,partial,received_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.exec('BEGIN');
  try {
    const starts=new Set(events.filter(e=>e.type==='run_start').map(e=>e.runId));
    const hasStart=db.prepare("SELECT 1 FROM events WHERE run_id=? AND type='run_start'");
    for(const e of events) {
      // A deleted or never-seen run must not create orphan milestones.
      if(e.runId && e.type!=='run_start' && !starts.has(e.runId) && !hasStart.get(e.runId))continue;
      put.run(e.id,e.visitId,e.runId,e.seq,e.type,e.build,e.day,e.elapsed,e.stage,e.tier,e.partial?1:0,now);
    }
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
  return events.map(e=>e.id);
}

export function summary(db, now=Date.now()) {
  cleanup(db,now);
  const events=db.prepare('SELECT * FROM events ORDER BY day,seq').all();
  const raw=aggregate(events),recent=raw.recent;
  const daily=[...raw.daily,...db.prepare('SELECT payload FROM daily_rollups').all().map(x=>JSON.parse(x.payload))].sort((a,b)=>a.day.localeCompare(b.day)||a.build.localeCompare(b.build));
  return { asOf:new Date(now).toISOString(),notice:'Participating sessions only. Recent days can change for seven days as offline play arrives. A last observed stage does not establish why play stopped.',daily,recent:{eligibleLoads:raw.eligibleLoads,starts:recent.length,firstAbsorbs:recent.filter(r=>r.first).length,townGoals:recent.filter(r=>r.goals.has('town')).length,finalGoals:recent.filter(r=>r.goals.has('universe')).length,results:recent.filter(r=>r.results).length,replayClicks:recent.filter(r=>r.replayClick).length,actualReplays:recent.filter(r=>r.replayStart).length,lastObserved:Object.fromEntries([...STAGES].map(s=>[s,recent.filter(r=>!r.goals.has('universe')&&r.stage===s).length]))}};
}

function safeEqual(a,b) {
  const x=createHash('sha256').update(a).digest(),y=createHash('sha256').update(b).digest();
  return timingSafeEqual(x,y);
}
export function createServer({db,allowedOrigins,adminUser,adminPassword,dataLabel='Local preview',now=()=>Date.now()}) {
  if(!adminUser || !adminPassword || !allowedOrigins?.length) throw new Error('admin credentials and allowed origins required');
  cleanup(db,now());
  const retentionTimer=setInterval(()=>cleanup(db,now()),60*60*1000);
  retentionTimer.unref();
  const page=readFileSync(join(ROOT,'dashboard.html'));
  let blocked=false,rateStart=0,rateCount=0;
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    const cors=allowedOrigins.includes(origin);
    const url=new URL(req.url,'http://localhost');
    const send=(status,data,headers={})=>{res.writeHead(status,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(data);};
    if(url.pathname==='/v1/events') {
      if(!cors)return send(403,'origin denied');
      const headers={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
      if(req.method==='OPTIONS')return send(204,'',headers);
      if(req.method!=='POST')return send(405,'method denied',headers);
      if(blocked)return send(503,'collection paused',headers);
      if(now()-rateStart>60000){rateStart=now();rateCount=0;}
      if(++rateCount>600)return send(429,'rate limit',headers);
      if(Number(req.headers['content-length'])>32768)return send(413,'too large',headers);
      let body='';
      try {for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>32768)return send(413,'too large',headers);}}
      catch{return send(400,'bad request',headers);}
      try {
        const value=JSON.parse(body);
        const ids=ingest(db,value.events,now());
        send(200,JSON.stringify({acked:ids}),{'Content-Type':'application/json',...headers});
      } catch {send(400,'invalid batch',headers);}
      return;
    }
    if(url.pathname==='/health')return send(200,'ok');
    const auth=req.headers.authorization||'';
    let supplied='';
    if(auth.startsWith('Basic '))try{supplied=Buffer.from(auth.slice(6),'base64').toString('utf8');}catch{}
    if(!safeEqual(supplied,adminUser+':'+adminPassword))return send(401,'private',{'WWW-Authenticate':'Basic realm="Twisty metrics"'});
    if(url.pathname==='/api/summary'&&req.method==='GET')return send(200,JSON.stringify({...summary(db,now()),dataLabel}),{'Content-Type':'application/json'});
    if(url.pathname==='/api/collection'&&req.method==='POST'){
      blocked=true;
      return send(200,JSON.stringify({collecting:false}),{'Content-Type':'application/json'});
    }
    if(url.pathname==='/'&&req.method==='GET')return send(200,page,{'Content-Type':'text/html; charset=utf-8'});
    send(404,'not found');
  });
  server.on('close',()=>clearInterval(retentionTimer));
  return {server,disableCollection:()=>{blocked=true;},get collecting(){return !blocked;}};
}

if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  if(process.env.METRICS_LOCAL_ONLY!=='1') throw new Error('Only local preview is implemented; set METRICS_LOCAL_ONLY=1');
  const path=process.env.METRICS_DB_PATH||join(ROOT,'local-metrics.sqlite');
  const db=openStore(path);
  const {server}=createServer({db,allowedOrigins:['http://127.0.0.1:8000','http://localhost:8000'],adminUser:process.env.METRICS_ADMIN_USER,adminPassword:process.env.METRICS_ADMIN_PASSWORD,dataLabel:process.env.METRICS_DATA_LABEL||'Local preview'});
  server.listen(8787,'127.0.0.1',()=>console.log('Private local metrics preview: http://127.0.0.1:8787/'));
}
