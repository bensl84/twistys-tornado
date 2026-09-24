// Discovery worlds: trip order, themed generation, a real mesh for every themed thing, and tiers that match sizes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].map(x=>x[1]);
const context=vm.createContext({console});
vm.runInContext(scripts[1],context);
const THREE=context.THREE,game=vm.runInContext(scripts[0]+'\nTornadoGame;',context),T=game.TUNING;
const themed=game.TYPES.filter(t=>t.theme);

test('trips through the black hole: plain town first, one theme per trip, then everything mixed',()=>{
  assert.equal(game.themeForLoop(0),null);
  T.THEME_ORDER.forEach((id,i)=>assert.equal(game.themeForLoop(i+1),id));
  assert.equal(game.themeForLoop(T.THEME_ORDER.length+1),'all');assert.equal(game.themeForLoop(40),'all');
  for(const id of T.THEME_ORDER){const info=game.themeInfo(id);assert.ok(info.name&&info.icon);}
  assert.ok(game.themeInfo('all').name);
});

test('every themed type is in exactly one theme scatter, and its tier matches its size band',()=>{
  const th=[0,...T.TIER_THRESHOLDS];
  for(const t of themed){
    assert.ok(T.THEMES[t.theme].scatter[t.id]>0,`${t.id} missing from ${t.theme} scatter`);
    assert.ok(t.size>=th[t.tier-1]*0.5&&t.size<th[t.tier],`${t.id} size ${t.size} does not fit tier ${t.tier}`);
  }
  for(const [name,def] of Object.entries(T.THEMES))for(const id of Object.keys(def.scatter))assert.equal(game.TYPES.find(t=>t.id===id)?.theme,name,id);
});

test('every themed type builds a finite, non-empty mesh',()=>{
  const builders=game.makeGeometryBuilders(THREE);
  for(const t of themed){
    const g=builders[t.id]();const p=g.attributes.position;assert.ok(p.count>0,t.id);
    for(let i=0;i<p.array.length;i++)assert.ok(Number.isFinite(p.array[i]),`${t.id} has a bad vertex`);
    g.computeBoundingBox();const b=g.boundingBox;assert.ok(b.min.y>-t.size,`${t.id} sinks below the ground`);
  }
});

test('a themed town adds its things; space stages and the plain town ignore themes',()=>{
  const plain=game.createGame(4,'town');assert.equal(plain.theme,null);assert.ok(!plain.objs.some(o=>o.type.theme));
  for(const id of [...T.THEME_ORDER,'all']){
    const G=game.createGame(4,'town',null,'normal',id);assert.equal(G.theme,id);
    const want=id==='all'?T.THEME_ORDER:[id];
    for(const w of want)assert.ok(G.objs.some(o=>o.type.theme===w),`${id}: no ${w} things`);
    assert.ok(G.objs.some(o=>o.type.id==='tower'),'the water tower is still the goal');
    assert.ok(G.objs.length<plain.objs.length*1.6,'theme load stays bounded');
  }
  assert.equal(game.createGame(4,'solar',null,'normal','candy').theme,null);
  assert.equal(game.createGame(4,'town',null,'normal','bogus').theme,null);
});

test('in the mixed town, no two kinds of themed thing share a spot (each kind has its own random stream)',()=>{
  for(const seed of [1,2,3]){
    const w=game.generateWorld(seed,'all'),byType=new Map();
    for(const o of w)if(o.type.theme){if(!byType.has(o.type.id))byType.set(o.type.id,new Set());byType.get(o.type.id).add(`${o.x.toFixed(3)},${o.z.toFixed(3)}`);}
    const ids=[...byType.keys()];
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
      const a=byType.get(ids[i]),b=byType.get(ids[j]);let shared=0;for(const k of a)if(b.has(k))shared++;
      assert.equal(shared,0,`seed ${seed}: ${ids[i]} and ${ids[j]} share ${shared} spots`);
    }
  }
});
