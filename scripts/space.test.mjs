import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual inline game logic without a browser or third-party dependency.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const game=vm.runInNewContext(source+'\nTornadoGame;', {console});
const planets=['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'];
const radius=(o,c)=>Math.hypot(o.x-c[0],o.z-c[1]);
const advance=(g,n=120)=>{for(let i=0;i<n;i++)game.stepGame(g);};

test('one of each planet in solar order, one Sun, valid orbit distances',()=>{
  for(let seed=1;seed<=5;seed++){
    const g=game.createGame(seed,'solar');let previous=0;
    for(const id of planets){
      const matches=g.objs.filter(o=>o.type.id===id);assert.equal(matches.length,1,id);
      const o=matches[0];assert.ok(o.orbit.radius>previous,id);previous=o.orbit.radius;
      assert.ok(Math.abs(radius(o,game.TUNING.SUN_POS)-o.orbit.radius)<1e-8,id);
      assert.equal(o.scale,1);assert.equal(o.state,0);
    }
    assert.equal(g.objs.filter(o=>o.type.id==='sun').length,1);
  }
});

test('planets move on stable solar-centered circles and inner planets move faster',()=>{
  const g=game.createGame(1,'solar'),before=g.orbiters.map(o=>[o.x,o.z]);advance(g);
  let speed=Infinity;
  for(let i=0;i<8;i++){
    const o=g.orbiters[i];assert.ok(Math.hypot(o.x-before[i][0],o.z-before[i][1])>.1);
    assert.ok(Math.abs(radius(o,game.TUNING.SUN_POS)-o.orbit.radius)<1e-8);
    assert.ok(o.orbit.speed<speed);speed=o.orbit.speed;
  }
});

test('Moon, satellite, shuttle and station follow Earth',()=>{
  const g=game.createGame(1,'solar');g.pos.x=9000;g.pos.z=9000;advance(g,300);
  const earth=g.objs.find(o=>o.type.id==='earth');
  const companions=g.orbiters.filter(o=>o.orbit.parent===earth);
  assert.deepEqual(Array.from(companions,o=>o.type.id).sort(),['moon','rocket','satellite','station']);
  for(const o of companions)assert.ok(Math.abs(radius(o,[earth.x,earth.z])-o.orbit.radius)<1e-8);
});

test('moving bodies remain discoverable after leaving their original spatial cell',()=>{
  const g=game.createGame(1,'solar');advance(g,300);
  const out=[];
  for(const o of g.orbiters){g.nearby(o.x,o.z,1,out);assert.equal(out.filter(v=>v===o).length,1);}
  g.nearby(0,0,1000,out);assert.equal(new Set(out).size,out.length);
});

test('consumed parents leave a stable orbital center and absorbed planets stop orbiting',()=>{
  const g=game.createGame(1,'solar');g.pos.x=9000;g.pos.z=9000;advance(g);
  const earth=g.objs.find(o=>o.type.id==='earth'),moon=g.orbiters.find(o=>o.type.id==='moon');
  const last=[earth.x,earth.z];earth.state=2;advance(g);
  assert.deepEqual([earth.x,earth.z],last);
  assert.ok(Math.abs(radius(moon,last)-moon.orbit.radius)<1e-8);
});

test('orbit metadata is isolated between games and deterministic for the same seed',()=>{
  const a=game.createGame(3,'solar'),b=game.createGame(3,'solar');
  assert.notEqual(a.orbiters[0].orbit,b.orbiters[0].orbit);
  advance(a);advance(b);
  assert.deepEqual(Array.from(a.orbiters,o=>[o.x,o.z]),Array.from(b.orbiters,o=>[o.x,o.z]));
});

test('other stages remain orbit-free and all four stages retain their goals',()=>{
  for(const id of ['town','solar','galaxy','universe']){
    const g=game.createGame(1,id);assert.ok(g.goalRef);assert.equal(g.goalRef.state,0);
    if(id!=='solar')assert.equal(g.orbiters.length,0);
  }
});
