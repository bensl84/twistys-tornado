// First-party milestone delivery. No SDK, permanent player ID, or gameplay dependency.
(() => {
  'use strict';
  const cfg=window.TWISTY_METRICS_CONFIG||{};
  // This build is a loopback preview. A public pilot needs a reviewed parent flow.
  const enabledHost=/^http:\/\/127\.0\.0\.1:8787\/v1\/events$/.test(cfg.endpoint||'') && ['127.0.0.1','localhost'].includes(location.hostname);
  const prefKey='twisty-metrics-preference-v1',queueKey='twisty-metrics-pending-v1';
  const uuid=()=>crypto.randomUUID();
  const visitId=uuid();
  const build=document.querySelector('meta[name="twisty-build"]')?.content||'';
  const MS7=7*86400000;
  let enabled=false,queue=[],seq=0,runId=null,runActive=false,first=false,replayPending=false,elapsed=0,lastCheckpoint=0,flushing=false,retry=1000,timer=null,inFlight=null,droppedRunIds=new Set();
  const validEndpoint=enabledHost && /^[a-z0-9][a-z0-9-]{3,79}$/.test(build);
  const read=(key)=>{try{return localStorage.getItem(key);}catch{return null;}};
  const write=(key,val)=>{try{localStorage.setItem(key,val);return true;}catch{return false;}};
  const remove=key=>{try{localStorage.removeItem(key);}catch{}};
  function cleanQueue(){
    const expiredStarts=new Set(queue.filter(x=>x?.event?.type==='run_start'&&Date.now()-x.queuedAt>=MS7).map(x=>x.event.runId));
    for(const id of expiredStarts)droppedRunIds.add(id);
    queue=queue.filter(x=>x&&x.event&&Date.now()-x.queuedAt<MS7);
    if(expiredStarts.size)queue=queue.filter(x=>!expiredStarts.has(x.event.runId));
    while(queue.length>100||JSON.stringify(queue).length>131072){
      const checkpoint=queue.findIndex(x=>x.event.type==='checkpoint');
      if(checkpoint>=0){queue.splice(checkpoint,1);continue;}
      const oldest=queue[0]?.event;
      if(!oldest)break;
      if(!oldest.runId){queue.shift();continue;}
      // Never leave a queued milestone behind after evicting its run start.
      droppedRunIds.add(oldest.runId);
      queue=queue.filter(x=>x.event.runId!==oldest.runId);
    }
    write(queueKey,JSON.stringify(queue));
  }
  function schedule(ms=0){if(!enabled||timer)return;timer=setTimeout(()=>{timer=null;flush();},ms);}
  function push(type,stage=null,tier=null,partial=false) {
    if(!enabled)return;
    const event={schema:1,id:uuid(),visitId,runId:type==='load'?null:runId,seq:++seq,type,build,day:new Date().toISOString().slice(0,10),elapsed:Math.round(elapsed*10)/10,stage,tier,partial};
    if(type!=='load'&&(!runId||droppedRunIds.has(runId)))return;
    queue.push({event,queuedAt:Date.now()});cleanQueue();schedule();
  }
  function storedPreference(){return read(prefKey)==='yes:'+cfg.noticeVersion;}
  function setPreference(yes){
    if(!validEndpoint)return;
    if(!yes){enabled=false;inFlight?.abort();clearTimeout(timer);timer=null;queue=[];droppedRunIds.clear();remove(queueKey);remove(prefKey);runId=null;runActive=false;replayPending=false;elapsed=0;return;}
    if(enabled)return;
    const existed=storedPreference();
    write(prefKey,'yes:'+cfg.noticeVersion);
    enabled=true;
    try{queue=JSON.parse(read(queueKey)||'[]');if(!Array.isArray(queue))queue=[];}catch{queue=[];}
    cleanQueue();
    push('load',null,null,!existed);
    schedule();
  }
  async function flush(){
    if(!enabled||flushing||!queue.length)return;
    flushing=true;
    const batch=[];let size=13;
    for(const item of queue){const bytes=JSON.stringify(item.event).length+1;if(batch.length>=64||size+bytes>32768)break;batch.push(item.event);size+=bytes;}
    try{
      inFlight=new AbortController();
      const res=await fetch(cfg.endpoint,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},signal:inFlight.signal,body:JSON.stringify({events:batch})});
      if(!enabled)return;
      if(res.ok){const body=await res.json(),ids=new Set(body.acked||[]);queue=queue.filter(x=>!ids.has(x.event.id));cleanQueue();retry=1000;if(queue.length)schedule();}
      else if(res.status>=400&&res.status<500&&res.status!==429){const ids=new Set(batch.map(x=>x.id));queue=queue.filter(x=>!ids.has(x.event.id));cleanQueue();retry=1000;}
      else{retry=Math.min(60000,retry*2);schedule(retry);}
    }catch{if(enabled){retry=Math.min(60000,retry*2);schedule(retry);}}
    finally{inFlight=null;flushing=false;if(enabled&&queue.length)schedule();}
  }
  function start(stage='town',tier=1){
    if(!enabled||runActive)return;
    droppedRunIds.clear();
    runId=uuid();runActive=true;first=false;elapsed=0;lastCheckpoint=0;
    push('run_start',stage,tier);
    push('stage',stage,tier);
    if(replayPending){push('replay_start',stage,tier);replayPending=false;}
  }
  function gameEvent(e,game){
    if(!enabled||!runActive||!e||!game)return;
    if(e.kind==='absorb'&&!first){first=true;push('first_absorb',game.stage,game.tier);}
    else if(e.kind==='tierup')push('tier',game.stage,game.tier);
    else if(e.kind==='stage')push('stage',game.stage,game.tier);
    else if(e.kind==='win')push('goal',game.stage,game.tier);
  }
  function tick(seconds,stage,tier){
    if(!enabled||!runActive)return;
    elapsed+=Math.max(0,Math.min(seconds,1));
    if(elapsed-lastCheckpoint>=30){lastCheckpoint=elapsed;push('checkpoint',stage,tier);}
  }
  function results(stage,tier){if(enabled&&runActive){push('results',stage,tier);runActive=false;}}
  function replay(stage,tier){if(enabled&&runId){push('replay_click',stage,tier);replayPending=true;}}
  function initUI(){
    const button=document.getElementById('metrics-parent-open'),panel=document.getElementById('metrics-parent-panel'),check=document.getElementById('metrics-parent-check');
    if(!button||!panel||!check)return;
    if(!validEndpoint){button.hidden=true;return;}
    button.hidden=false;check.checked=storedPreference();
    button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();panel.hidden=!panel.hidden;});
    panel.addEventListener('click',e=>e.stopPropagation());
    check.addEventListener('change',()=>setPreference(check.checked));
    if(check.checked)setPreference(true);
  }
  window.addEventListener('online',()=>schedule());
  window.addEventListener('pagehide',()=>{
    if(!enabled||!queue.length||!navigator.sendBeacon)return;
    const batch=queue.slice(0,30).map(x=>x.event);
    navigator.sendBeacon(cfg.endpoint,new Blob([JSON.stringify({events:batch})],{type:'application/json'}));
  });
  window.TwistyMetrics={initUI,start,gameEvent,tick,results,replay,setPreference,get enabled(){return enabled;}};
})();
