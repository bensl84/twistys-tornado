// Generate a disposable synthetic dataset to preview the private dashboard.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, ingest } from './server.mjs';

const output=process.argv[2]||join(dirname(fileURLToPath(import.meta.url)),'demo.sqlite');
if(existsSync(output))throw new Error('Demo file exists; supply a new output path to preserve it: node metrics/demo.mjs PATH');
const db=openStore(output),day=new Date().toISOString().slice(0,10),build='2026-09-17-twister-v13-metrics-local';
const all=[];
function put(visitId,runId,seq,type,stage='town',elapsed=0){all.push({schema:1,id:randomUUID(),visitId,runId,seq,type,build,day,elapsed,stage:type==='load'?null:stage,tier:type==='load'?null:1,partial:false});}
try{
  for(let i=0;i<10;i++){
    const visitId=randomUUID(),runId=randomUUID();let seq=1;
    put(visitId,null,seq++,'load');put(visitId,runId,seq++,'run_start');put(visitId,runId,seq++,'stage');
    if(i<9)put(visitId,runId,seq++,'first_absorb','town',3);
    if(i<8){put(visitId,runId,seq++,'goal','town',78);put(visitId,runId,seq++,'stage','solar',80);}
    if(i<7){put(visitId,runId,seq++,'goal','solar',140);put(visitId,runId,seq++,'stage','galaxy',142);}
    if(i<6){put(visitId,runId,seq++,'goal','galaxy',195);put(visitId,runId,seq++,'stage','universe',197);}
    if(i<5){put(visitId,runId,seq++,'goal','universe',250);put(visitId,runId,seq++,'results','universe',250);}
    if(i<3){put(visitId,runId,seq++,'replay_click','town',250);const second=randomUUID();put(visitId,second,seq++,'run_start');put(visitId,second,seq++,'stage');put(visitId,second,seq++,'replay_start');}
  }
  for(let i=0;i<all.length;i+=64)ingest(db,all.slice(i,i+64));
  console.log('Synthetic dashboard data written to '+output);
}finally{db.close();}
