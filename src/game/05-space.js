// =====================================================================================================
// SPACE STAGE GENERATION. Jittered-grid pickups and deterministic, animated planet orbits.
// =====================================================================================================
function generateSpace(seed) {
  const rnd = mulberry32(seed * 104729 + 7);
  const objs = [];
  const R = TUNING.SPACE_RADIUS;
  function add(typeId, x, z, ry) {
    const t = SPACE_TYPE_BY_ID[typeId];
    const jit = t.id === 'sun' ? 1 : 1 + (rnd() * 2 - 1) * TUNING.SIZE_JITTER;
    const o = { id: objs.length, type: t, x, z, ry: ry || 0, scale: jit, size: t.size * jit, foot: t.foot * jit, colorIndex: Math.floor(rnd() * t.colors.length), state: 0,
      rattleT: -99, rattledTooBig: false, inRange: false, absorbT: 0, absorbDur: 0, spiralA: 0, spiralR: 0, highlightT: 0, startX: 0, startZ: 0, rattleTick: -99, swayT: -99, rattleAmp: 1, inst: -1, mesh: null };
    objs.push(o); return o;
  }
  const okPoint = (x, z) => x * x + z * z <= R * R && Math.hypot(x, z) >= 70;
  for (const id in TUNING.SPACE_SCATTER) {
    const n = TUNING.SPACE_SCATTER[id]; const cell = Math.sqrt(Math.PI * R * R / n); const off = rnd() * cell, off2 = rnd() * cell;
    for (let gx = -R - cell; gx <= R + cell; gx += cell) for (let gz = -R - cell; gz <= R + cell; gz += cell) { const x = gx + off + rnd() * cell, z = gz + off2 + rnd() * cell; if (okPoint(x, z)) add(id, x, z, rnd() * TAU); }
  }
  for (const id in TUNING.SPACE_START_KIT) { const n = TUNING.SPACE_START_KIT[id]; for (let i = 0; i < n; i++) { const a = rnd() * TAU, r = 25 + Math.sqrt(rnd()) * 110; add(id, Math.cos(a) * r, Math.sin(a) * r, rnd() * TAU); } }
  // One of each real planet, in solar order. Moving bodies are indexed separately from the static spatial hash.
  for (const orbit of SOLAR_ORBITS) {
    const o = add(orbit.id, TUNING.SUN_POS[0] + Math.cos(orbit.phase) * orbit.radius, TUNING.SUN_POS[1] + Math.sin(orbit.phase) * orbit.radius, 0);
    o.orbit = {...orbit}; o.scale = 1; o.size = o.type.size; o.foot = o.type.foot;
  }
  const earth = objs.find(o => o.type.id === 'earth');
  for (const [id, radius, phase, speed] of [['moon', 145, 0, 0.025], ['satellite', 94, 2.4, 0.065], ['rocket', 112, 4, 0.05], ['station', 130, 1, 0.035]]) {
    const o = add(id, earth.x + Math.cos(phase) * radius, earth.z + Math.sin(phase) * radius, 0);
    o.orbit = { parent: earth, radius, phase, speed };
  }
  add('sun', TUNING.SUN_POS[0], TUNING.SUN_POS[1], 0);
  // nothing inside a bigger solid body
  const solids = objs.filter(o => o.type.blocks).sort((a, b) => b.size - a.size);
  for (const s of solids) { if (s.state === 2) continue; for (const o of objs) { if (o === s || o.orbit || o.state === 2 || o.size >= s.size) continue; const need = s.foot + o.foot + 5; const dx = o.x - s.x, dz = o.z - s.z; if (dx * dx + dz * dz < need * need) o.state = 2; } }
  return objs.filter(o => o.state !== 2).map((o, i) => (o.id = i, o));
}

// Which discovery world a trip lands in: none on the first visit, then one theme per trip, then all of them mixed.
function themeForLoop(loop) { const order = TUNING.THEME_ORDER; return loop <= 0 ? null : loop <= order.length ? order[loop - 1] : 'all'; }
function themeInfo(theme) { return theme === 'all' ? TUNING.THEME_MIX : TUNING.THEMES[theme] || null; }
function themeScatter(theme) {
  if (!theme) return [];
  const list = theme === 'all' ? TUNING.THEME_ORDER : TUNING.THEMES[theme] ? [theme] : [];
  const scale = theme === 'all' ? TUNING.THEME_MIX_SCALE : 1, out = [];
  for (const t of list) for (const id in TUNING.THEMES[t].scatter) out.push([id, Math.max(1, Math.round(TUNING.THEMES[t].scatter[id] * scale))]);
  return out;
}
function themeGround(theme) { if (theme === 'all') return null; const t = TUNING.THEMES[theme]; return t ? t.ground : null; }

// Open-space field: uniform scatter, a start kit, and a few placed landmarks (the goal among them). Used by the galaxy and universe stages.
function generateField(seed, byId, scatter, R, kit, placed) {
  const rnd = mulberry32(seed * 104729 + 7);
  const objs = [];
  function add(typeId, x, z, ry) {
    const t = byId[typeId];
    const jit = t.tier === 6 ? 1 : 1 + (rnd() * 2 - 1) * TUNING.SIZE_JITTER;
    const o = { id: objs.length, type: t, x, z, ry: ry || 0, scale: jit, size: t.size * jit, foot: t.foot * jit, colorIndex: Math.floor(rnd() * t.colors.length), state: 0,
      rattleT: -99, rattledTooBig: false, inRange: false, absorbT: 0, absorbDur: 0, spiralA: 0, spiralR: 0, highlightT: 0, startX: 0, startZ: 0, rattleTick: -99, swayT: -99, rattleAmp: 1, inst: -1, mesh: null };
    objs.push(o); return o;
  }
  const okPoint = (x, z) => x * x + z * z <= R * R && Math.hypot(x, z) >= 70;
  for (const id in scatter) {
    const n = scatter[id]; const cell = Math.sqrt(Math.PI * R * R / n); const off = rnd() * cell, off2 = rnd() * cell;
    for (let gx = -R - cell; gx <= R + cell; gx += cell) for (let gz = -R - cell; gz <= R + cell; gz += cell) { const x = gx + off + rnd() * cell, z = gz + off2 + rnd() * cell; if (okPoint(x, z)) add(id, x, z, rnd() * TAU); }
  }
  for (const id in kit) { const n = kit[id]; for (let i = 0; i < n; i++) { const a = rnd() * TAU, r = 25 + Math.sqrt(rnd()) * 110; add(id, Math.cos(a) * r, Math.sin(a) * r, rnd() * TAU); } }
  for (const [id, x, z] of placed) add(id, x, z, 0);
  const solids = objs.filter(o => o.type.blocks).sort((a, b) => b.size - a.size);
  for (const s of solids) { if (s.state === 2) continue; for (const o of objs) { if (o === s || o.state === 2 || o.size >= s.size) continue; const need = s.foot + o.foot + 5; const dx = o.x - s.x, dz = o.z - s.z; if (dx * dx + dz * dz < need * need) o.state = 2; } }
  return objs.filter(o => o.state !== 2).map((o, i) => (o.id = i, o));
}

