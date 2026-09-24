// =====================================================================================================
// WORLD GENERATION (seeded, deterministic). Produces a flat array of object records.
// =====================================================================================================
function generateWorld(seed, theme) {
  const rnd = mulberry32(seed * 7919 + 13);
  const objs = [];
  const R = TUNING.WORLD_RADIUS;
  const [sx, sz] = TUNING.START_POS;
  function add(typeId, x, z, ry, sizeMul) {
    const t = TYPE_BY_ID[typeId];
    if (x * x + z * z > R * R) return null;
    const jit = t.id === 'tower' ? 1 : 1 + (rnd() * 2 - 1) * TUNING.SIZE_JITTER; // the goal is exactly its listed size
    const o = {
      id: objs.length, type: t, x, z, ry: ry || 0,
      scale: jit * (sizeMul || 1), size: t.size * jit * (sizeMul || 1), foot: t.foot * jit * (sizeMul || 1),
      colorIndex: Math.floor(rnd() * t.colors.length),
      state: 0, // 0 idle, 1 absorbing, 2 absorbed
      rattleT: -99, rattledTooBig: false, inRange: false, absorbT: 0, absorbDur: 0, spiralA: 0, spiralR: 0, highlightT: 0,
      startX: 0, startZ: 0, rattleTick: -99, swayT: -99, rattleAmp: 1, inst: -1, mesh: null,
    };
    objs.push(o);
    return o;
  }
  const scatter = (typeId, cx, cz, radius, n) => { for (let i = 0; i < n; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * radius; add(typeId, cx + Math.cos(a) * r, cz + Math.sin(a) * r, rnd() * TAU); } };
  const RS = TUNING.ROAD_SPACING;
  const roadsX = [], roadsZ = [];
  for (let k = -3; k <= 3; k++) { roadsX.push(k * RS); roadsZ.push(k * RS); }
  const nearRoad = (x, z, d) => { for (const rx of roadsX) if (Math.abs(x - rx) < d) return true; for (const rz of roadsZ) if (Math.abs(z - rz) < d) return true; return false; };

  // ---- Lots along roads ----
  function lots(alongIsX, roadCoord) {
    for (let s = -R; s <= R; s += TUNING.LOT_SPACING) {
      for (const side of [-1, 1]) {
        // skip intersections
        const other = alongIsX ? roadsX : roadsZ;
        if (other.some(rc => Math.abs(s - rc) < 22)) continue;
        if (rnd() > TUNING.LOT_CHANCE) continue;
        if (Math.hypot((alongIsX ? s : roadCoord) - sx, (alongIsX ? roadCoord : s) - sz) < TUNING.START_YARD_R + 10) continue;
        const off = 16 + rnd() * 4;
        const px = alongIsX ? s + (rnd() - 0.5) * 4 : roadCoord + side * off;
        const pz = alongIsX ? roadCoord + side * off : s + (rnd() - 0.5) * 4;
        // orientation: house front faces the road. Model front = -z.
        const ry = alongIsX ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
        const fx = alongIsX ? 0 : -side, fz = alongIsX ? -side : 0; // unit vector from house toward road
        const lx = alongIsX ? 1 : 0, lz = alongIsX ? 0 : 1;        // unit vector along the road
        const nearStart = Math.hypot(px - sx, pz - sz) < 14;
        if (!nearStart) {
          if (rnd() < 0.12 && Math.hypot(px, pz) > 90) add('barn', px - fx * 8, pz - fz * 8, ry, 1); else add('house', px, pz, ry);
        }
        // mailbox at the road edge, trash can beside the driveway
        if (rnd() < 0.9) add('mailbox', px + fx * (off - 5) + lx * 3, pz + fz * (off - 5) + lz * 3, ry + Math.PI);
        if (rnd() < 0.85) add('can', px + fx * (off - 7) + lx * -4, pz + fz * (off - 7) + lz * -4, rnd() * TAU);
        if (rnd() < 0.6 && !nearStart) add('car', px + fx * 9 + lx * 5, pz + fz * 9 + lz * 5, ry + (alongIsX ? Math.PI / 2 : 0));
        const nch = Math.floor(rnd() * 3.2);
        for (let i = 0; i < nch; i++) add('chair', px - fx * (7 + rnd() * 4) + lx * (rnd() * 10 - 5), pz - fz * (7 + rnd() * 4) + lz * (rnd() * 10 - 5), rnd() * TAU);
        if (rnd() < 0.35 && !nearStart) add('shed', px - fx * 12 + lx * (rnd() * 8 - 4), pz - fz * 12 + lz * (rnd() * 8 - 4), ry);
        const rv = rnd();
        if (!nearStart) { if (rv < 0.12) add('rv', px + fx * 4 + lx * -9, pz + fz * 4 + lz * -9, ry + Math.PI / 2); else if (rv < 0.28) add('boat', px + fx * 4 + lx * -8, pz + fz * 4 + lz * -8, ry + Math.PI / 2); }
        const nt = Math.floor(rnd() * 1.8);
        for (let i = 0; i < nt; i++) {
          const tx = px + lx * (rnd() * 20 - 10) + fx * (rnd() * 24 - 14), tz = pz + lz * (rnd() * 20 - 10) + fz * (rnd() * 24 - 14);
          if (Math.hypot(tx - sx, tz - sz) < 9) continue;
          add(rnd() < 0.3 ? 'pine' : 'tree', tx, tz, rnd() * TAU);
        }
        scatter('leaf', px + fx * 4, pz + fz * 4, 12, TUNING.YARD_LEAVES);
        scatter('paper', px + fx * (off - 4), pz + fz * (off - 4), 6, 1);
        scatter('trash', px + fx * (off - 6), pz + fz * (off - 6), 5, 1);
        // fence run along one lot edge
        if (rnd() < 0.25) { const n = 2 + Math.floor(rnd() * 2); for (let i = 0; i < n; i++) add('fence', px + lx * (11) + fx * (-6 + 2.4 * i) * 1, pz + lz * 11 + fz * (-6 + 2.4 * i), ry + Math.PI / 2); }
      }
    }
  }
  for (const rz of roadsZ) lots(true, rz);
  for (const rx of roadsX) lots(false, rx);

  // ---- Fields between roads ----
  for (let i = -4; i < 4; i++) for (let j = -4; j < 4; j++) {
    const cx = (i + 0.5) * RS, cz = (j + 0.5) * RS;
    if (Math.hypot(cx, cz) > R - 20) continue;
    const inner = RS / 2 - 40;
    const P = () => [cx + (rnd() * 2 - 1) * inner, cz + (rnd() * 2 - 1) * inner];
    if (rnd() < 0.85) { const [bx, bz] = P(); add('barn', bx, bz, rnd() < 0.5 ? 0 : Math.PI / 2); if (rnd() < 0.6) add('silo', bx + 16, bz - 4, 0); if (rnd() < 0.5) add('shed', bx + 18, bz + 8, 0); if (rnd() < 0.5) add('rv', bx - 16, bz + 10, 0.3); }
    for (let c = 0; c < TUNING.FIELD_TREE_CLUMPS; c++) { const [tx, tz] = P(); const n = 2 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) { const a = rnd() * TAU, r = rnd() * 14; add(rnd() < 0.5 ? 'pine' : 'tree', tx + Math.cos(a) * r, tz + Math.sin(a) * r, rnd() * TAU); } scatter('leaf', tx, tz, 16, 8); }
    // fence lines along two edges of the field
    for (const edge of (rnd() < 0.5 ? [0] : [1])) {
      const n = 3 + Math.floor(rnd() * 3);
      const start = -inner + rnd() * 60;
      for (let k = 0; k < n; k++) {
        if (edge === 0) add('fence', cx + start + k * 2.4, cz - inner - 8, 0); else add('fence', cx - inner - 8, cz + start + k * 2.4, Math.PI / 2);
      }
    }
    if (rnd() < 0.3) { const [ax, az] = P(); add('car', ax, az, rnd() * TAU); }

  }

  // ---- Landmarks ----
  add('tower', TUNING.TOWER_POS[0], TUNING.TOWER_POS[1], 0);

  // ---- Uniform scatter over the plain (off roads, outside the start yard) ----
  const YR = TUNING.START_YARD_R;
  // Jittered grid: one object per cell, so the largest gap between neighbours is bounded (no starved regions).
  const okPoint = (x, z) => x * x + z * z <= R * R && !nearRoad(x, z, 6) && Math.hypot(x - sx, z - sz) >= YR;
  for (const id in TUNING.SCATTER) {
    const n = TUNING.SCATTER[id];
    const cell = Math.sqrt(Math.PI * R * R / n);
    const off = rnd() * cell, off2 = rnd() * cell;
    for (let gx = -R - cell; gx <= R + cell; gx += cell) for (let gz = -R - cell; gz <= R + cell; gz += cell) {
      const x = gx + off + rnd() * cell, z = gz + off2 + rnd() * cell;
      if (!okPoint(x, z)) continue;
      if (id === 'fence') { const ry = rnd() < 0.5 ? 0 : Math.PI / 2, k = 1 + Math.floor(rnd() * 2); for (let j = 0; j < k; j++) add('fence', x + (ry === 0 ? j * 2.4 : 0), z + (ry === 0 ? 0 : j * 2.4), ry); }
      else add(id, x, z, rnd() * TAU);
    }
  }

  // ---- Discovery world: this trip's themed things, scattered the same way (a separate RNG keeps the base town identical) ----
  for (const [id, n] of themeScatter(theme)) {
    const idHash = [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261); // FNV-1a: every kind gets its own stream
    const trnd = mulberry32((seed * 104723 + idHash + n) >>> 0); const cell = Math.sqrt(Math.PI * R * R / n);
    const off = trnd() * cell, off2 = trnd() * cell;
    for (let gx = -R - cell; gx <= R + cell; gx += cell) for (let gz = -R - cell; gz <= R + cell; gz += cell) {
      const x = gx + off + trnd() * cell, z = gz + off2 + trnd() * cell;
      if (okPoint(x, z)) add(id, x, z, trnd() * TAU);
    }
  }

  // ---- Start yard: immediate food, and a whole backyard of things she cannot eat yet ----
  for (let i = 0; i < 3; i++) { const a = rnd() * TAU, r = 1.5 + rnd() * 5; add('leaf', sx + Math.cos(a) * r, sz + Math.sin(a) * r, rnd() * TAU); }
  for (let i = 0; i < 2; i++) { const a = rnd() * TAU, r = 2 + rnd() * 6; add('paper', sx + Math.cos(a) * r, sz + Math.sin(a) * r, rnd() * TAU); }
  for (let i = 0; i < 1; i++) { const a = rnd() * TAU, r = 3 + rnd() * 5; add('trash', sx + Math.cos(a) * r, sz + Math.sin(a) * r, rnd() * TAU); }
  for (const id in TUNING.START_YARD) { const n = TUNING.START_YARD[id]; for (let i = 0; i < n; i++) { const a = rnd() * TAU, r = (id === 'leaf' || id === 'paper' || id === 'trash' ? 3 : 4) + Math.sqrt(rnd()) * (YR - 4); add(id, sx + Math.cos(a) * r, sz + Math.sin(a) * r, rnd() * TAU); } }
  add('chair', sx + 4.5, sz - 3, 0.4); add('chair', sx - 5, sz - 2.5, -0.5); add('can', sx + 1, sz - 7, 0);
  add('house', sx - 4, sz - 26, 0); add('car', sx + 14, sz - 20, 0.2); add('shed', sx + 22, sz + 4, 0.5); add('tree', sx - 20, sz + 8, 0); add('pine', sx + 18, sz + 22, 0); add('tree', sx - 16, sz - 14, 0);
  for (let j = 0; j < 4; j++) add('fence', sx - 12 + j * 2.4, sz + 18, 0);

  // Remove solid objects that would sit on top of the start
  for (const o of objs) if (o.type.blocks && Math.hypot(o.x - sx, o.z - sz) < 7 + o.foot) o.state = 2;
  // Nothing may sit inside a solid object's footprint (it could never be reached); bigger solids win.
  {
    const solids = objs.filter(o => o.type.blocks && o.state !== 2).sort((a, b) => b.size - a.size);
    for (const s of solids) {
      if (s.state === 2) continue;
      for (const o of objs) {
        if (o === s || o.state === 2 || o.size >= s.size) continue;
        const need = s.foot + (o.type.blocks ? o.foot : o.foot * 0.5) + 0.3;
        const dx = o.x - s.x, dz = o.z - s.z;
        if (dx * dx + dz * dz < need * need) o.state = 2;
      }
    }
  }
  // Keep objects off the roads (visual/logic tidiness) except leaves/paper/trash
  for (const o of objs) if (o.type.tier >= 2 && o.type.id !== 'fence' && o.type.id !== 'tower' && nearRoad(o.x, o.z, TUNING.ROAD_WIDTH / 2 + o.foot * 0.6)) o.state = 2;
  return objs.filter(o => o.state !== 2).map((o, i) => (o.id = i, o));
}

