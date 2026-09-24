// =====================================================================================================
// BOT (self-test): one virtual finger. Steers toward the nearest edible object, preferring the current tier.
// =====================================================================================================
function createBot(G, view) {
  let target = null, retarget = 0, chaseTicks = 0, bestDist = Infinity; const blacklist = new Map(); const _botNear = [];
  let curious = null, curiousStart = 0, curiousRattle = 0, lastCurious = 0, curiousMax = 240; const poked = new Map(); const stats = { pokes: 0, hits: 0 };
  const out = { x: 0, y: 0, ok: false }, out2 = { x: 0, y: 0, ok: false };
  return {
    step(setTouch, lift) {
      // curiosity: periodically go poke the nearest too-big object that is on screen
      if (!curious && G.tick - lastCurious > TUNING.BOT_CURIOSITY_S * 60) {
        let best = null, bestD = Infinity;
        for (const o of G.objs) {
          if (o.state !== 0 || o.size <= G.power || o.size > G.power * 4) continue;
          const pk = poked.get(o.id); if (pk !== undefined && pk > G.tick) continue;
          const d = Math.hypot(o.x - G.pos.x, o.z - G.pos.z); if (d > G.camDist * 1.3 || d >= bestD) continue;
          const sp = view.project(o.x, 0, o.z, out); if (!sp.ok || sp.x < -view.width * 0.2 || sp.x > view.width * 1.2 || sp.y < -view.height * 0.2 || sp.y > view.height * 1.2) continue;
          best = o; bestD = d;
        }
        lastCurious = G.tick;
        if (best) { curious = best; curiousStart = G.tick; curiousRattle = best.rattleT; poked.set(best.id, G.tick + 3600); stats.pokes++; curiousMax = clamp(bestD / (TUNING.MAX_SPEED * G.speedScale()) * 1.3 + 1, 4, TUNING.BOT_CURIOSITY_MAX_S) * 60; }
      }
      if (curious) {
        const done = curious.state !== 0 || curious.rattleT !== curiousRattle || G.tick - curiousStart > curiousMax;
        if (done) { if (curious.rattleT !== curiousRattle) stats.hits++; curious = null; lastCurious = G.tick; }
        else {
          const dx = curious.x - G.pos.x, dz = curious.z - G.pos.z; const d = Math.hypot(dx, dz) || 1;
          const sp = view.project(curious.x, 0, curious.z, out);
          if (sp.ok) setTouch(clamp(sp.x, 8, view.width - 8), clamp(sp.y, 8, view.height - 8));
          else { const c = view.project(G.pos.x, 0, G.pos.z, out2); setTouch(clamp(c.x + dx / d * view.height * 0.3, 8, view.width - 8), clamp(c.y + dz / d * view.height * 0.3, 8, view.height - 8)); }
          return;
        }
      }
      if (target && target.state === 0) { const d = Math.hypot(target.x - G.pos.x, target.z - G.pos.z); if (d < bestDist - 0.5) { bestDist = d; chaseTicks = 0; } else if (++chaseTicks > TUNING.BOT_GIVEUP_TICKS) { blacklist.set(target.id, G.tick + 1800); target = null; } }
      if (--retarget <= 0 || !target || target.state !== 0) {
        retarget = TUNING.BOT_RETARGET_TICKS;
        if (target && target.state !== 0) chaseTicks = 0;
        // nearest edible thing, with bigger (more satisfying) things worth a longer trip; crumbs only if nothing else
        let best = null, bestD = Infinity, bestAny = null, bestAnyD = Infinity, tower = null; const towerRef = G.goalRef; const cands = [];
        for (const o of G.objs) {
          if (o.state !== 0 || o.size > G.power) continue;
          const bl = blacklist.get(o.id); if (bl !== undefined) { if (bl > G.tick) continue; blacklist.delete(o.id); }
          if (o.type.id === G.goalId) tower = o;
          const frac = o.size / G.power;
          let dist = Math.hypot(o.x - G.pos.x, o.z - G.pos.z) * (o.rattledTooBig ? TUNING.BOT_GRUDGE : 1);
          if (dist < bestAnyD) { bestAnyD = dist; bestAny = o; }
          if (frac < TUNING.DUST_FRAC) continue;
          let d = dist / (0.7 + frac);
          if (G.tier >= 6 && towerRef) { d = dist + Math.hypot(o.x - towerRef.x, o.z - towerRef.z) * 0.7; } // on the way to the goal
          if (d < bestD * 1.6 || cands.length < 6) { cands.push({ o, d }); }
          if (d < bestD) { bestD = d; best = o; }
        }
        // among the closest candidates, prefer the one with more edible company nearby (a child steers toward the busy part of the screen)
        if (cands.length > 1 && G.tier < 6) {
          cands.sort((a, b) => a.d - b.d);
          const top = cands.slice(0, 8); const rr = Math.max(12, G.camDist * 0.25); let bestScore = Infinity;
          for (const c of top) {
            if (c.d > bestD * 1.6) continue;
            G.nearby(c.o.x, c.o.z, rr, _botNear); let n = 0;
            for (const q of _botNear) if (q !== c.o && q.state === 0 && q.size <= G.power && q.size >= G.power * TUNING.DUST_FRAC) n++;
            const score = c.d / (1 + TUNING.BOT_CROWD * Math.min(n, 8));
            if (score < bestScore) { bestScore = score; best = c.o; bestD = c.d; }
          }
        }
        let nt = (G.tier >= 6 && tower) ? (best || tower) : (best || bestAny);
        if (target && target.state === 0 && nt !== target && target.size <= G.power && G.tier < 6) {
          const tf = target.size / G.power; const ts = Math.hypot(target.x - G.pos.x, target.z - G.pos.z) / (0.7 + tf);
          if (bestD > ts * TUNING.BOT_SWITCH_RATIO) nt = target; // not clearly better: stay the course
        }
        if (nt !== target) { chaseTicks = 0; bestDist = Infinity; }
        target = nt;
      }
      if (!target) { lift(); return; }
      // hold the finger a little past the target so the tornado does not brake on top of it
      const dx = target.x - G.pos.x, dz = target.z - G.pos.z; const d = Math.hypot(dx, dz) || 1;
      const lead = G.funnelR() * TUNING.PULL_RADIUS * TUNING.BOT_LEAD;
      let wx = target.x + dx / d * lead, wz = target.z + dz / d * lead;
      // steer around solid things it cannot eat (a child learns this in the first minute)
      {
        const ux = dx / d, uz = dz / d; const look = Math.min(d, G.camDist * 0.8);
        const blockR = G.funnelR() * TUNING.BLOCK_RADIUS;
        let worst = null, worstAlong = Infinity, side = 0;
        G.nearby(G.pos.x + ux * look * 0.5, G.pos.z + uz * look * 0.5, look * 0.5 + 12, _botNear);
        for (const o of _botNear) {
          if (o.state !== 0 || !o.type.blocks || o.size <= G.power || o === target) continue;
          const ox = o.x - G.pos.x, oz = o.z - G.pos.z; const along = ox * ux + oz * uz; if (along < 0 || along > look) continue;
          const across = ox * -uz + oz * ux; const rr = blockR + o.foot + G.funnelR() * 0.6;
          if (Math.abs(across) < rr && along < worstAlong) { worst = o; worstAlong = along; side = across >= 0 ? -1 : 1; }
        }
        if (worst) { const rr = blockR + worst.foot + G.funnelR() * 0.8; const px = -uz * side, pz = ux * side; wx = G.pos.x + ux * worstAlong + px * rr; wz = G.pos.z + uz * worstAlong + pz * rr; }
      }
      // project to screen so the bot goes through the exact same touch path as a finger.
      // Off-screen targets: hold the finger ahead of the tornado in the target's direction (what a hand does).
      const s = view.project(wx, 0, wz, out);
      const onScreen = s.ok && s.x > 8 && s.x < view.width - 8 && s.y > 8 && s.y < view.height - 8;
      if (onScreen) setTouch(s.x, s.y);
      else {
        const c = view.project(G.pos.x, 0, G.pos.z, out2);
        const reach = view.height * 0.35;
        // camera looks north (-z) with no yaw: world +x -> screen right, world -z -> screen up
        const sx = c.x + dx / d * reach, sy = c.y + dz / d * reach;
        setTouch(clamp(sx, 8, view.width - 8), clamp(sy, 8, view.height - 8));
      }
    },
    get target() { return target; }, get curious() { return curious; }, get stats() { return stats; },
  };
}

