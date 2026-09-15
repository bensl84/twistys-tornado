import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const game=vm.runInNewContext(source+'\nTornadoGame;',{console});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('each stage denominator is generated collectible volume, not object count or decoration',()=>{
  for(const stage of ['town','solar','galaxy','universe']){
    const G=game.createGame(1,stage);near(G.massStats.totalMass,G.objs.reduce((sum,o)=>sum+o.size**3,0));
    assert.ok(G.massStats.totalMass>0);assert.equal(G.massStats.consumedMass,0);
  }
});
test('real absorption counts dust and large objects exactly once without changing denominator',()=>{
  const G=game.createGame(1),total=G.massStats.totalMass;
  const leaf=G.objs.find(o=>o.type.id==='leaf'),house=G.objs.find(o=>o.type.id==='house');
  G.power=100;game.finishAbsorb(G,leaf);
  assert.equal(G.events.at(-1).kind,'dust');near(G.massStats.consumedMass,leaf.size**3);
  game.finishAbsorb(G,leaf);near(G.massStats.consumedMass,leaf.size**3);
  G.power=house.size;game.finishAbsorb(G,house);
  near(G.massStats.consumedMass,leaf.size**3+house.size**3);assert.equal(G.massStats.totalMass,total);
  assert.ok(house.size**3>leaf.size**3*1000);
});
test('pulling and rattling objects do not count as consumed',()=>{
  const G=game.createGame(1);G.objs[0].state=1;G.emit('pull',{id:0});G.emit('rattle',{id:1});
  assert.equal(G.massStats.consumedMass,0);
});
test('black-hole mass is the equal-stage average; combined score balances both forms',()=>{
  const run=game.createRunStats();
  run.stages={town:{totalMass:100,consumedMass:50},solar:{totalMass:10,consumedMass:10},galaxy:{totalMass:1e9,consumedMass:5e8},universe:{totalMass:1e15,consumedMass:0}};
  const s=game.summarizeRun(run);near(s.tornadoPercent,50);near(s.blackholePercent,50);near(s.totalPercent,50);
});
test('unvisited stages contribute zero; progress cannot exceed 100 percent',()=>{
  const run=game.createRunStats();assert.equal(game.summarizeRun(run).totalPercent,0);
  run.stages.solar={totalMass:10,consumedMass:10};near(game.summarizeRun(run).blackholePercent,100/3);
  for(const id of ['town','solar','galaxy','universe'])run.stages[id]={totalMass:10,consumedMass:11};
  assert.equal(game.summarizeRun(run).totalPercent,100);
});
test('timers accumulate across black-hole stages and total both forms',()=>{
  const run=game.createRunStats();game.advanceRunTime(run,'town',65);
  for(const stage of ['solar','galaxy','universe'])game.advanceRunTime(run,stage,30);
  for(const bad of [-5,NaN,Infinity])game.advanceRunTime(run,'town',bad);
  const s=game.summarizeRun(run);assert.equal(s.tornadoSeconds,65);assert.equal(s.blackholeSeconds,90);assert.equal(s.totalSeconds,155);
});
test('new runs reset counters and completed summaries do not mutate',()=>{
  const run=game.createRunStats();game.advanceRunTime(run,'town',5);const summary=game.summarizeRun(run);
  game.advanceRunTime(run,'town',5);assert.equal(summary.totalSeconds,5);assert.equal(game.summarizeRun(game.createRunStats()).totalSeconds,0);
});
test('readouts format minutes/hours and keep tiny positive mass visible',()=>{
  assert.equal(game.formatDuration(0),'0:00');assert.equal(game.formatDuration(65.9),'1:05');assert.equal(game.formatDuration(3605),'1:00:05');
  assert.equal(game.formatPercent(0),'0.0%');assert.equal(game.formatPercent(.0001),'<0.1%');assert.equal(game.formatPercent(99.99),'99.9%');assert.equal(game.formatPercent(100),'100.0%');
});
