// Level clock rules: presets, super size at SUPER_SIZE_AT_S seconds left, the goal flies in at 0, the clock stops at the win.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const game=vm.runInNewContext(source+'\nTornadoGame;',{console});
const T=game.TUNING,DT=1/60;
const run=(G,seconds)=>{const n=Math.round(seconds/DT);for(let i=0;i<n;i++)game.stepGame(G);};

test('three start-screen settings; the top one gives five minutes to every level',()=>{
  assert.deepEqual(Object.keys(T.LEVEL_TIMERS),['quick','normal','adult']);
  assert.equal(T.LEVEL_TIMER_DEFAULT,'normal');
  assert.equal(T.LEVEL_TIMERS.adult.town,300);assert.equal(T.LEVEL_TIMERS.adult.space,300);
  for(const [mode,t] of Object.entries(T.LEVEL_TIMERS)){
    assert.equal(game.createGame(1,'town',null,mode).levelLimit,t.town);
    for(const stage of ['solar','galaxy','universe'])assert.equal(game.createGame(1,stage,null,mode).levelLimit,t.space);
  }
  assert.equal(game.createGame(1,'town',null,'nonsense').timerMode,'normal');
  assert.equal(game.createGame(1,'town').levelLimit,T.LEVEL_TIMERS.normal.town);
});

for(const [stage,mustTimeOut] of [['town',true],['solar',false]]){
  test(`${stage}: at 10 s left the player becomes the biggest size, and the level always ends by the limit`,()=>{
    const G=game.createGame(3,stage,null,'quick'),limit=G.levelLimit;
    run(G,limit-T.SUPER_SIZE_AT_S-0.5);
    assert.equal(G.superSized,false);assert.ok(G.power<G.goalSize,'still smaller than the goal');
    run(G,0.6);
    assert.equal(G.superSized,true);assert.ok(G.events.some(e=>e.kind==='supersize'));
    run(G,T.SUPER_GROW_S+0.1);
    assert.ok(Math.abs(G.power-G.goalSize*1.05)<1e-6,`power ${G.power}`);assert.equal(G.tier,6);
    run(G,T.SUPER_SIZE_AT_S+T.TIMEOUT_PULL_S);
    assert.equal(G.won,true);assert.equal(G.goalRef.state,2);
    assert.ok(G.levelWinT>=limit-T.SUPER_SIZE_AT_S&&G.levelWinT<=limit+T.TIMEOUT_PULL_S+0.1,`won at ${G.levelWinT}`);
    const win=G.events.find(e=>e.kind==='win');assert.equal(win.timedOut,G.timedOut);
    // An idle player in town is far from the water tower, so the clock runs out and the tower flies in.
    if(mustTimeOut){assert.equal(G.timedOut,true);assert.ok(G.levelWinT>=limit);}
    const frozen=G.levelT;run(G,2);assert.equal(G.levelT,frozen,'the clock stops at the win');
  });
}

test('a level won before the clock runs out never super-sizes or times out',()=>{
  const G=game.createGame(1,'town',null,'normal');run(G,5);
  G.power=G.goalSize*1.05;game.checkTierUps(G);game.finishAbsorb(G,G.goalRef);
  assert.equal(G.won,true);assert.equal(G.timedOut,false);assert.equal(G.superSized,false);
  run(G,G.levelLimit);
  assert.equal(G.superSized,false);assert.equal(G.timedOut,false);assert.ok(Math.abs(G.levelWinT-5)<1e-6);
});

test('super size never shrinks a player who is already bigger, and the goal pull is idempotent',()=>{
  const G=game.createGame(2,'town',null,'quick');G.power=G.goalSize*2;
  game.startSuperSize(G);assert.equal(G.superT,0);assert.equal(G.power,G.goalSize*2);
  game.timeUp(G);const s=G.goalRef.state;game.timeUp(G);assert.equal(G.goalRef.state,s);
  assert.equal(G.absorbing.filter(o=>o===G.goalRef).length,1);
});

test('the goal bobs at its normal highlight size through the whole countdown (never an unbounded scale)',()=>{
  const G=game.createGame(3,'town',null,'quick');
  run(G,G.levelLimit-T.SUPER_SIZE_AT_S+0.1);
  assert.equal(G.superSized,true);assert.ok(G.highlighted.includes(G.goalRef));
  for(let s=0;s<T.SUPER_SIZE_AT_S-0.5;s+=0.5){
    run(G,0.5);
    if(G.goalRef.state!==0)break;
    assert.ok(G.goalRef.highlightT>0&&G.goalRef.highlightT<=T.HIGHLIGHT_S,`highlightT ${G.goalRef.highlightT} at ${G.levelT.toFixed(1)} s`);
  }
});

test('last level: you swallow the big black hole, except on the 5-minute setting where it swallows you',()=>{
  const reach=(mode)=>{
    const G=game.createGame(2,'universe',null,mode),g=G.goalRef,seen=[];G.listeners.push(e=>seen.push(e));
    G.power=G.goalSize*1.05;game.checkTierUps(G);G.pos.x=g.x+g.foot*0.5;G.pos.z=g.z;
    run(G,T.SWALLOW_S+T.SPIRAL_S_BIG+0.5);
    return {G,g,seen,win:seen.find(e=>e.kind==='win')};
  };
  const normal=reach('normal');
  assert.ok(normal.win,'normal: the level is won');assert.equal(normal.g.state,2,'normal: the black hole is swallowed');
  assert.ok(!normal.win.swallowed);assert.equal(normal.G.swallowed,false);
  const adult=reach('adult');
  assert.ok(adult.win,'adult: the run still ends');assert.equal(adult.win.swallowed,true);assert.equal(adult.G.swallowed,true);
  assert.equal(adult.g.state,0,'adult: the black hole is still there');
  assert.ok(Math.hypot(adult.G.pos.x-adult.g.x,adult.G.pos.z-adult.g.z)<1e-6,'adult: pulled right into the middle');
  assert.ok(adult.seen.some(e=>e.kind==='swallow'));
  // only the last level: earlier levels on the 5-minute setting are eaten normally
  const G=game.createGame(2,'galaxy',null,'adult'),g=G.goalRef;G.power=G.goalSize*1.05;game.checkTierUps(G);G.pos.x=g.x;G.pos.z=g.z;
  run(G,T.SPIRAL_S_BIG+0.5);assert.equal(g.state,2);assert.equal(G.swallowed,false);
});

test('5-minute setting: when the clock runs out on the last level, the black hole pulls you in',()=>{
  const G=game.createGame(2,'universe',null,'adult'),seen=[];G.listeners.push(e=>seen.push(e));
  G.levelT=G.levelLimit-0.05;run(G,0.1);
  assert.equal(G.timedOut,true);assert.ok(G.swallowT>0,'swallow started');
  run(G,T.SWALLOW_S+0.2);
  const win=seen.find(e=>e.kind==='win');assert.ok(win&&win.swallowed&&win.timedOut);
  assert.ok(G.levelWinT<=G.levelLimit+T.SWALLOW_S+0.1);
});
