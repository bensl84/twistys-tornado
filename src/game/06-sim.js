// =====================================================================================================
// GAME STATE + SIMULATION STEP (pure logic; no rendering, no wall-clock).
// =====================================================================================================
// Rendered sizes are a gameplay volume proxy, not kilograms. Never add town and cosmic units directly.
const objectMass = o => Math.pow(o.size,3);
function createRunStats() { return { seconds:{tornado:0,blackhole:0}, stages:{} }; }
function advanceRunTime(run,stage,seconds) {
  if(Number.isFinite(seconds)&&seconds>0)run.seconds[stage==='town'?'tornado':'blackhole']+=seconds;
}
function summarizeRun(run) {
  const fraction=id=>{const s=run.stages[id];return s&&s.totalMass>0?clamp(s.consumedMass/s.totalMass,0,1):0;};
  const tornadoPercent=fraction('town')*100,blackholePercent=(fraction('solar')+fraction('galaxy')+fraction('universe'))/3*100;
  return {tornadoSeconds:run.seconds.tornado,blackholeSeconds:run.seconds.blackhole,totalSeconds:run.seconds.tornado+run.seconds.blackhole,tornadoPercent,blackholePercent,totalPercent:(tornadoPercent+blackholePercent)/2};
}
function formatDuration(seconds) {
  const s=Math.max(0,Math.floor(seconds)),h=Math.floor(s/3600),m=Math.floor(s/60)%60;
  return h?`${h}:${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`:`${m}:${String(s%60).padStart(2,'0')}`;
}
function formatPercent(value) { const p=clamp(value,0,100);return p>0&&p<.1?'<0.1%':`${(Math.floor(p*10+1e-9)/10).toFixed(1)}%`; }
function createGame(seed, stageId, colorId, timerMode, theme) {
  stageId = stageId || 'town';
  const ST = STAGES[stageId];
  const sp = ST.startPos();
  const G = {
    seed, tick: 0, time: 0,       // time = simulated seconds (advances by DT * timeScale per tick; hitstop freezes it)
    stage: stageId, stageDef: ST, colorId: colorId || 'blue',
    theme: stageId === 'town' && (theme === 'all' || TUNING.THEMES[theme]) ? theme : null,
    objs: ST.generate(seed, stageId === 'town' ? theme : null),
    power: ST.startPower(), tier: 1,
    pos: { x: sp[0], z: sp[1] }, vel: { x: 0, z: 0 }, acc: { x: 0, z: 0 }, heading: 0, speed: 0,
    finger: { down: false, x: 0, z: 0 },       // ground-plane target
    intent: { x: 0, z: 0 },                    // unit vector toward the finger (drives the funnel tilt)
    hitstop: 0, slowmo: 0, timeScale: 1, fovPunch: 0, shake: 0, shakeSeed: 0,
    camDist: 0, camDistTarget: 0, camPitch: TUNING.CAM_PITCH, focus: { x: 0, z: 0 }, camPos: { x: 0, y: 0, z: 0 },
    events: [],                                // {t, kind, size, tier, id}
    absorbCount: 0, tierUps: 0, won: false, winT: null, firstAbsorbOfTier: {},
    timerMode: TUNING.LEVEL_TIMERS[timerMode] ? timerMode : TUNING.LEVEL_TIMER_DEFAULT, levelT: 0, levelLimit: 0, levelWinT: null, // level clock: ticks * DT, stops at the win
    superSized: false, superT: 0, superFrom: 0, superTo: 0, timedOut: false,
    distSinceDust: 0, timeSinceDust: 0, lastResponseTick: -1, lastInputTick: -1, stuckT: 0, squeeze: 0, lastBlockT: -99, bestDF: Infinity, prevX: sp[0], prevZ: sp[1],
    grid: null, absorbing: [], rattleQueue: [],
    listeners: [],
  };
  G.massStats={totalMass:G.objs.reduce((sum,o)=>sum+objectMass(o),0),consumedMass:0};
  G.camDist = G.camDistTarget = TUNING.CAM_DIST0 + G.power * TUNING.CAM_DIST_K;
  G.goalId = ST.goal; G.goalRef = G.objs.find(o => o.type.id === ST.goal) || null; G.goalSize = ST.byId[ST.goal].size;
  { const tm = TUNING.LEVEL_TIMERS[G.timerMode]; G.levelLimit = stageId === 'town' ? tm.town : tm.space; }
  G.focus.x = G.pos.x; G.focus.z = G.pos.z;
  // spatial hash for neighbor queries
  const CELL = 12;
  const grid = new Map();
  const key = (cx, cz) => cx * 100003 + cz;
  for (const o of G.objs) {
    const cx = Math.floor(o.x / CELL), cz = Math.floor(o.z / CELL);
    const k = key(cx, cz); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(o);
  }
  G.grid = grid;
  G.orbiters = G.objs.filter(o => o.orbit);
  G.nearby = function (x, z, r, out) {
    out.length = 0;
    if (r > 90) { for (let i = 0; i < G.objs.length; i++) out.push(G.objs[i]); return out; }
    const c0x = Math.floor((x - r) / CELL), c1x = Math.floor((x + r) / CELL), c0z = Math.floor((z - r) / CELL), c1z = Math.floor((z + r) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) { const a = grid.get(key(cx, cz)); if (a) for (let i = 0; i < a.length; i++) if (!a[i].orbit) out.push(a[i]); }
    for (const o of G.orbiters) out.push(o);
    return out;
  };
  G.emit = function (kind, data) { const e = Object.assign({ t: G.time, tick: G.tick, kind }, data); G.events.push(e); if (G.events.length > 400) G.events.splice(0, 200); for (const l of G.listeners) l(e); };
  G.funnelR = () => G.power * TUNING.FUNNEL_RADIUS;
  G.speedScale = () => Math.pow(G.camDist / (TUNING.CAM_DIST0 + TUNING.START_POWER * TUNING.CAM_DIST_K), TUNING.SPEED_SCALE_EXP) * (ST.speedMult ? ST.speedMult() : 1);
  return G;
}

const _near = [];
function updateOrbits(G, dt) {
  G.orbitTime=(G.orbitTime||0)+dt;
  for (const o of G.orbiters) {
    if (o.state !== 0) continue;
    const orbit = o.orbit;
    // Once Earth is consumed, its remaining spacecraft keep their last orbital center.
    if (!orbit.parent || orbit.parent.state === 0) {
      orbit.cx = orbit.parent ? orbit.parent.x : TUNING.SUN_POS[0];
      orbit.cz = orbit.parent ? orbit.parent.z : TUNING.SUN_POS[1];
    }
    const a = orbit.phase + G.orbitTime * orbit.speed;
    o.x = (orbit.cx ?? TUNING.SUN_POS[0]) + Math.cos(a) * orbit.radius;
    o.z = (orbit.cz ?? TUNING.SUN_POS[1]) + Math.sin(a) * orbit.radius;
    o.ry += dt * 0.12;
  }
}
function stepGame(G) {
  G.tick++;
  const T = TUNING;
  // ---- level clock: real ticks (it pauses whenever the simulation does), stops at the win ----
  if (!G.won) {
    G.levelT += DT;
    const left = G.levelLimit - G.levelT;
    if (!G.superSized && left <= T.SUPER_SIZE_AT_S) startSuperSize(G);
    if (!G.timedOut && left <= 0) timeUp(G);
  }
  if (G.superT > 0) {
    G.superT = Math.max(0, G.superT - DT);
    const k = easeOut(1 - G.superT / T.SUPER_GROW_S);
    G.power = Math.max(G.power, Math.exp(lerp(Math.log(G.superFrom), Math.log(G.superTo), k)));
    checkTierUps(G);
  }
  // ---- time scale (slow-mo) and hitstop ----
  if (G.slowmo > 0) { G.slowmo -= DT; G.timeScale = G.slowmo > 0 ? lerp(T.SLOWMO_SCALE, 1, easeIn(clamp(1 - G.slowmo / T.SLOWMO_S, 0, 1))) : 1; } else { G.slowmo = 0; G.timeScale = 1; }
  // decay-only effects run on real ticks
  G.fovPunch *= Math.exp(-T.FOV_PUNCH_DECAY * DT);
  G.shake *= Math.exp(-T.SHAKE_DECAY * DT);
  // intent: the funnel top tilts toward the finger on the very next frame, even inside a hitstop
  if (G.finger.down) {
    const ix = G.finger.x - G.pos.x, iz = G.finger.z - G.pos.z; const id = Math.hypot(ix, iz);
    const nx = id > 1e-6 ? ix / id : 0, nz = id > 1e-6 ? iz / id : 0;
    if (G.lastResponseTick < G.lastInputTick && (Math.abs(nx - G.intent.x) > 1e-4 || Math.abs(nz - G.intent.z) > 1e-4 || id < 1e-6)) G.lastResponseTick = G.tick;
    G.intent.x = nx; G.intent.z = nz;
  } else { G.intent.x = 0; G.intent.z = 0; }
  if (G.hitstop > 0) { G.hitstop--; updateCamera(G, DT); return; }
  const dt = DT * G.timeScale;
  G.time += dt;
  updateOrbits(G,dt);

  // ---- movement: chase the finger with momentum + turn rate (heading/speed model) ----
  const ss = G.speedScale();
  let anchored = false; for (let i = 0; i < G.absorbing.length; i++) if (G.absorbing[i].size >= G.power * T.ANCHOR_FRAC) { anchored = true; break; }
  const maxSpeed = T.MAX_SPEED * ss * (anchored ? T.ANCHOR_SPEED : 1), accel = T.ACCEL * ss, decel = T.DECEL * ss;
  const pvx = G.vel.x, pvz = G.vel.z;
  if (G.finger.down) {
    const dx = G.finger.x - G.pos.x, dz = G.finger.z - G.pos.z;
    const d = Math.hypot(dx, dz);
    const arrive = T.ARRIVE_DIST * ss;
    const desired = d > 1e-6 ? Math.min(maxSpeed, maxSpeed * (d / (arrive * 3))) : 0; // ease in near the finger
    if (d > 1e-6) {
      const wantH = Math.atan2(dz, dx);
      let dh = wantH - G.heading; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
      // slow tornado pivots quickly; a fast one carves a wide turn
      const spdFrac = clamp(G.speed / maxSpeed, 0, 1);
      const turnRate = T.TURN_RATE * (1 + T.TURN_SNAP * (1 - spdFrac));
      const maxTurn = turnRate * dt;
      G.heading += clamp(dh, -maxTurn, maxTurn);
      // bleed speed on hard turns so it feels like carving, not sliding
      const carve = 1 - T.CARVE * clamp(Math.abs(dh) / Math.PI, 0, 1);
      const target = desired * carve;
      G.speed += clamp(target - G.speed, -decel * dt, accel * dt);
    } else {
      G.speed += clamp(0 - G.speed, -decel * dt, accel * dt);
    }
  } else {
    G.speed *= Math.exp(-T.DRAG * dt);
  }
  G.vel.x = Math.cos(G.heading) * G.speed; G.vel.z = Math.sin(G.heading) * G.speed;
  G.acc.x = (G.vel.x - pvx) / dt; G.acc.z = (G.vel.z - pvz) / dt;
  if (G.finger.down && G.lastResponseTick < G.lastInputTick) {
    const dx = G.finger.x - G.pos.x, dz = G.finger.z - G.pos.z;
    if ((G.acc.x * dx + G.acc.z * dz) > 1e-9 || (Math.abs(G.acc.x) + Math.abs(G.acc.z)) > 1e-6) G.lastResponseTick = G.tick;
  }
  G.pos.x += G.vel.x * dt; G.pos.z += G.vel.z * dt;

  // ---- object interaction ----
  const fr = G.funnelR();
  const pullR = fr * T.PULL_RADIUS, rattleR = fr * T.RATTLE_RADIUS, blockR = fr * T.BLOCK_RADIUS;
  const search = Math.max(pullR, rattleR, blockR) + 10;
  G.nearby(G.pos.x, G.pos.z, search, _near);
  let blocked = false;
  if (G.squeeze > 0) G.squeeze -= dt;
  for (let i = 0; i < _near.length; i++) {
    const o = _near[i];
    if (o.state !== 0) continue;
    const dx = o.x - G.pos.x, dz = o.z - G.pos.z;
    const d = Math.hypot(dx, dz);
    if (o.size <= G.power) {
      if (d < pullR + o.foot) beginAbsorb(G, o, d);
    } else {
      if (o.type.blocks && d < blockR + o.foot && G.squeeze <= 0) {
        // slide around solid too-big objects (no damage, no fail state)
        blocked = true;
        const pen = blockR + o.foot - d;
        const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
        G.pos.x -= nx * pen; G.pos.z -= nz * pen;
        // flow around it like water: rotate the heading toward the tangent on the finger's side
        const tx = -nz, tz = nx;
        let side = 1;
        if (G.finger.down) { const fx = G.finger.x - G.pos.x, fz = G.finger.z - G.pos.z; side = (fx * tx + fz * tz) >= 0 ? 1 : -1; }
        const tangH = Math.atan2(tz * side, tx * side);
        let dh = tangH - G.heading; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
        G.heading += clamp(dh, -T.TURN_RATE * 3 * dt, T.TURN_RATE * 3 * dt);
        G.vel.x = Math.cos(G.heading) * G.speed; G.vel.z = Math.sin(G.heading) * G.speed;
      }
      if (d < fr * T.WIND_RADIUS + o.foot && G.time - o.swayT > T.SWAY_COOLDOWN_S && G.time - o.rattleT > T.SWAY_COOLDOWN_S) { o.swayT = G.time; G.emit('sway', { size: o.size, tier: o.type.tier, id: o.id }); }
      const inRange = o.type.blocks ? (d < (blockR * T.RATTLE_SOLID_MARGIN + o.foot) && G.squeeze <= 0) : d < rattleR + o.foot;
      if (inRange && !o.inRange && G.time - o.rattleT > T.RATTLE_COOLDOWN_S) {
        o.rattleT = G.time; o.rattledTooBig = true;
        G.emit('rattle', { size: o.size, tier: o.type.tier, id: o.id, frac: G.power / o.size, squeeze: G.squeeze > 0 });
      }
      o.inRange = inRange;
    }
  }
  // pinned between solid objects? after STUCK_S the tornado squeezes through (never a dead end)
  // "pinned" = blocked recently and making no progress toward the finger (covers sliding back and forth in a pocket)
  if (blocked) G.lastBlockT = G.time;
  if (G.finger.down) {
    const dF = Math.hypot(G.finger.x - G.pos.x, G.finger.z - G.pos.z);
    if (dF < G.bestDF - 0.3) { G.bestDF = dF; G.stuckT = 0; }
    else if (dF > T.ARRIVE_DIST * ss * 3 && G.time - G.lastBlockT < 0.6) G.stuckT += dt; else G.stuckT = 0;
  } else { G.stuckT = 0; G.bestDF = Infinity; }
  if (G.stuckT > T.STUCK_S) { G.stuckT = 0; G.bestDF = Infinity; G.squeeze = T.SQUEEZE_S; G.emit('squeeze', {}); }
  G.prevX = G.pos.x; G.prevZ = G.pos.z;
  // ---- absorbing objects spiral in ----
  for (let i = G.absorbing.length - 1; i >= 0; i--) {
    const o = G.absorbing[i];
    o.absorbT += dt / o.absorbDur;
    if (o.absorbT >= 1) { G.absorbing.splice(i, 1); finishAbsorb(G, o); }
  }
  // ---- cruising dust puffs (feedback while travelling) ----
  G.distSinceDust += G.speed * dt; G.timeSinceDust += dt;
  if ((G.speed > T.IDLE_SPEED && G.distSinceDust > T.DUST_PUFF_M * ss) || G.timeSinceDust > T.DUST_PUFF_S) { G.distSinceDust = 0; G.timeSinceDust = 0; G.emit('puff', { size: fr }); }
  // highlight timers
  for (let i = G.highlighted ? G.highlighted.length - 1 : -1; i >= 0; i--) { const o = G.highlighted[i]; if (G.superSized && o === G.goalRef) o.highlightT = T.HIGHLIGHT_S; else o.highlightT -= dt; if (o.highlightT <= 0 || o.state !== 0) G.highlighted.splice(i, 1); }
  updateCamera(G, dt);
}

function beginAbsorb(G, o, d) {
  o.state = 1; o.absorbT = 0;
  const frac = clamp(o.size / G.power, 0, 1);
  o.absorbDur = lerp(TUNING.SPIRAL_S, TUNING.SPIRAL_S_BIG, frac);
  o.spiralA = Math.atan2(o.z - G.pos.z, o.x - G.pos.x); o.spiralR = d; o.startX = o.x; o.startZ = o.z;
  G.absorbing.push(o);
  G.emit('pull', { size: o.size, tier: o.type.tier, id: o.id, frac });
}

function finishAbsorb(G, o) {
  if(o.state===2)return; // Count every consumed object exactly once, including non-growing dust.
  o.state = 2;
  G.massStats.consumedMass+=objectMass(o);
  const T = TUNING;
  const frac = clamp(o.size / G.power, 0, 1);
  const tierOfObj = o.type.tier;
  const conversion = o.rattledTooBig;
  if (frac < T.DUST_FRAC && o.type.id !== G.goalId) { G.power *= 1 + T.DUST_GROWTH; G.emit('dust', { size: o.size, tier: tierOfObj, id: o.id, frac, conversion, x: o.x, z: o.z }); return; }
  const prevPower = G.power;
  G.power = Math.min(G.power * (1 + T.GROWTH * (G.stageDef.growthMult ? G.stageDef.growthMult() : (T.TIER_GROWTH_MULT[G.tier - 1] || 1)) * frac), G.goalSize * 1.05);
  G.absorbCount++;
  G.shake = Math.min(T.SHAKE_MAX, Math.max(G.shake, T.SHAKE_K * Math.pow(frac, 1.5) * T.SHAKE_MAX / T.SHAKE_MAX));
  if (frac >= T.HITSTOP_MIN_FRAC) G.hitstop = T.HITSTOP_TICKS;
  let firstOfTier = false;
  if (!G.firstAbsorbOfTier[tierOfObj]) { G.firstAbsorbOfTier[tierOfObj] = true; firstOfTier = true; if (tierOfObj > 1) G.slowmo = T.SLOWMO_S; }
  G.emit('absorb', { size: o.size, tier: tierOfObj, id: o.id, frac, conversion, firstOfTier, x: o.x, z: o.z });
  checkTierUps(G);
  if (o.type.id === G.goalId && !G.won) { G.won = true; G.winT = G.time; G.levelWinT = G.levelT; G.slowmo = T.SLOWMO_S * 2; G.emit('win', { t: G.time, stage: G.stage, final: !!G.stageDef.last, levelT: G.levelT, timedOut: G.timedOut }); }
  void prevPower;
}

function checkTierUps(G) {
  const T = TUNING, th = G.stageDef.thresholds();
  while (G.tier - 1 < th.length && G.power >= th[G.tier - 1]) {
    G.tier++; G.tierUps++; G.fovPunch = T.FOV_PUNCH;
    // highlight the nearest few newly-edible objects so she sees what just opened up
    const cands = [];
    for (const q of G.objs) if (q.state === 0 && q.type.tier === G.tier && q.size <= G.power) cands.push(q);
    cands.sort((a, b) => (Math.hypot(a.x - G.pos.x, a.z - G.pos.z) - Math.hypot(b.x - G.pos.x, b.z - G.pos.z)));
    G.highlighted = G.highlighted || [];
    for (let i = 0; i < Math.min(3, cands.length); i++) { cands[i].highlightT = T.HIGHLIGHT_S; G.highlighted.push(cands[i]); }
    G.emit('tierup', { tier: G.tier, power: G.power });
  }
}

// Level clock at SUPER_SIZE_AT_S seconds left: grow to the level's biggest size so the last seconds are a feast.
function startSuperSize(G) {
  const T = TUNING;
  G.superSized = true;
  G.superFrom = Math.max(G.power, 1e-3); G.superTo = Math.max(G.power, G.goalSize * 1.05);
  G.superT = G.superTo > G.superFrom ? T.SUPER_GROW_S : 0;
  G.fovPunch = T.FOV_PUNCH * 1.6; G.slowmo = Math.max(G.slowmo, T.SLOWMO_S);
  const g = G.goalRef;
  // the goal keeps a normal-sized bob for the whole countdown (the highlight loop re-pins it while super-sized)
  if (g && g.state === 0) { g.highlightT = T.HIGHLIGHT_S; G.highlighted = G.highlighted || []; if (!G.highlighted.includes(g)) G.highlighted.push(g); }
  G.emit('supersize', { left: G.levelLimit - G.levelT, power: G.superTo });
}

// Level clock at 0: the goal flies in from wherever it is. The level always ends; nobody is left stuck.
function timeUp(G) {
  const T = TUNING;
  G.timedOut = true;
  G.emit('timeup', {});
  const g = G.goalRef;
  if (!g) { G.won = true; G.winT = G.time; G.levelWinT = G.levelT; G.emit('win', { t: G.time, stage: G.stage, final: !!G.stageDef.last, levelT: G.levelT, timedOut: true }); return; }
  if (g.state !== 0) return; // already on its way in
  G.power = Math.max(G.power, G.goalSize * 1.05); G.superT = 0; checkTierUps(G);
  beginAbsorb(G, g, Math.hypot(g.x - G.pos.x, g.z - G.pos.z));
  g.absorbDur = T.TIMEOUT_PULL_S;
}

// Camera follows on the logic side so telemetry (visibility) matches what is rendered.
function updateCamera(G, dt) {
  const T = TUNING;
  G.camDistTarget = T.CAM_DIST0 + G.power * T.CAM_DIST_K;
  const k = 1 - Math.exp(-T.CAM_SMOOTH * dt);
  G.camDist += (G.camDistTarget - G.camDist) * k;
  const p01 = clamp(Math.log(G.power / T.START_POWER) / Math.log(28 / T.START_POWER), 0, 1);
  G.camPitch = lerp(T.CAM_PITCH, T.CAM_PITCH_MIN, p01);
  const sp = Math.hypot(G.vel.x, G.vel.z);
  const ms = T.MAX_SPEED * G.speedScale();
  const lx = sp > 0.01 ? G.vel.x / Math.max(sp, 1e-6) * Math.min(1, sp / ms) : 0, lz = sp > 0.01 ? G.vel.z / Math.max(sp, 1e-6) * Math.min(1, sp / ms) : 0;
  const fx = G.pos.x + lx * G.camDist * T.CAM_LOOK_AHEAD, fz = G.pos.z + lz * G.camDist * T.CAM_LOOK_AHEAD - G.camDist * T.CAM_FORWARD;
  G.focus.x += (fx - G.focus.x) * k; G.focus.z += (fz - G.focus.z) * k;
  G.camPos.x = G.focus.x; G.camPos.y = Math.sin(G.camPitch) * G.camDist; G.camPos.z = G.focus.z + Math.cos(G.camPitch) * G.camDist;
}

