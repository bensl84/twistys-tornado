// =====================================================================================================
// APP: wires input, loop, renderer, audio, and the self-test harness.
// =====================================================================================================
function boot() {
  const THREE = window.THREE;
  const canvas = document.getElementById('c');
  const startEl = document.getElementById('start');
  const errors = []; let consoleErrors = 0;
  window.addEventListener('error', e => { consoleErrors++; errors.push(String(e.message || e)); });
  window.addEventListener('unhandledrejection', e => { consoleErrors++; errors.push('unhandledrejection: ' + String(e.reason)); });
  const origErr = console.error.bind(console); console.error = (...a) => { consoleErrors++; errors.push(a.map(String).join(' ')); origErr(...a); };

  const app = { G: null, R: null, audio: createAudio(), running: false, simMode: false, contextLost: false, raf: 0, acc: 0, last: 0 };
  const cam = { x: 0, y: 0, z: 0, pitch: 0, fov: TUNING.FOV, aspect: 1 };
  const groundPt = { x: 0, z: 0 };
  function camState() { const G = app.G; cam.x = G.camPos.x; cam.y = G.camPos.y; cam.z = G.camPos.z; cam.pitch = G.camPitch; cam.fov = TUNING.FOV + G.fovPunch; cam.aspect = app.R.width / app.R.height; return cam; }
  function setTouch(sx, sy) {
    const G = app.G; if (!G) return;
    if(G.overview||app.resultsOpen||app.finale||document.hidden)return;
    screenToGround(camState(), sx, sy, app.R.width, app.R.height, groundPt);
    const wasDown = G.finger.down;
    G.finger.down = true; G.finger.x = groundPt.x; G.finger.z = groundPt.z;
    G.lastInputTick = G.tick; if (!wasDown) { G.lastResponseTick = -1; G.bestDF = Infinity; if (!app.simMode && app.running) window.TwistyMetrics?.start(G.stage,G.tier); }
  }
  function lift() { if (app.G) app.G.finger.down = false; }

  function newGame(seed, opts, stageId) {
    opts = opts || {};
    if (app.R) app.R.reset();
    const theme = (stageId || 'town') !== 'town' ? null : opts.theme !== undefined ? opts.theme : themeForLoop(app.loop);
    app.G = createGame(seed, stageId || 'town', app.colorId, app.timerMode, theme);
    if(!app.run||app.G.stage==='town')app.run=createRunStats();
    if(!app.runLevels||app.G.stage==='town')app.runLevels={};
    app.run.stages[app.G.stage]=app.G.massStats;
    const mapButton=document.getElementById('space-map');
    mapButton.classList.toggle('hidden',app.G.stage==='town');mapButton.setAttribute('aria-pressed','false');mapButton.setAttribute('aria-label','Show space overview');
    document.getElementById('map-caption').classList.add('hidden');document.getElementById('map-note').classList.add('hidden');
    if (!app.R) { app.R = createRenderer(THREE, canvas, { dpr: opts.dpr, antialias: opts.antialias, shadowMap: opts.shadowMap }); }
    app.R.setEnvironment(app.G.stage, app.G.stageDef.env);
    app.R.setTheme(app.G.theme);
    app.R.buildObjects(app.G.objs, app.G.stageDef.types);
    app.R.setColor(app.colorId);
    const wasTornado = app.R.form === 'tornado';
    app.R.setForm(app.G.stageDef.form);
    if (wasTornado && app.G.stageDef.form === 'blackhole') app.G.slowmo = TUNING.SLOWMO_S * 1.5; // the collapse into a black hole gets a beat
    app.G.listeners.push(e => app.R.onEvent(e, app.G));
    app.G.listeners.push(e => app.audio.onEvent(e, app.G));
    app.G.listeners.push(e => { if (e.kind === 'win' && !app.simMode) recordLevel(app.G, e); });
    app.G.listeners.push(e => { if (!app.simMode && !(app.finale && app.finale.reborn)) window.TwistyMetrics?.gameEvent(e,app.G); });
    onResize();
    updateCamera(app.G, 1); app.R.update(app.G, DT);
    for (const h of app.stageHooks) h(app.G);
    app.last=performance.now();
  }
  // After the goal: the next stage with the same color. The last stage loops back to a fresh town (new seed).
  function nextStage() {
    const G = app.G; if (!G || !G.stageDef.next) return false;
    if (G.stageDef.last && !app.simMode) { app.loop++; writeStore(LOOP_KEY, String(app.loop)); }
    newGame(G.stageDef.last ? G.seed + 1 : G.seed, {}, G.stageDef.next);
    app.G.emit('stage', { stage: app.G.stage });
    return true;
  }
  app.colorId = 'blue'; app.stageHooks = []; app.finale = null;
  // ---- level timer setting + best times: stored on this device only (never sent anywhere) ----
  const TIMER_KEY = 'twisty-timer-v1', BEST_KEY = 'twisty-best-v1', LOOP_KEY = 'twisty-loop-v1';
  const readStore = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const writeStore = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode: skip */ } };
  app.loop = Math.max(0, Math.min(99, parseInt(readStore(LOOP_KEY, '0'), 10) || 0)); // trips through the black hole on this device
  app.timerMode = TUNING.LEVEL_TIMERS[readStore(TIMER_KEY, '')] ? readStore(TIMER_KEY, '') : TUNING.LEVEL_TIMER_DEFAULT;
  function loadBest() { try { const b = JSON.parse(readStore(BEST_KEY, '{}')); return b && typeof b === 'object' ? b : {}; } catch (e) { return {}; } }
  function bestFor(mode, id) { const b = loadBest(); const v = b[mode] && b[mode][id]; return Number.isFinite(v) ? v : null; }
  function setBest(mode, id, t) { const b = loadBest(); b[mode] = b[mode] || {}; b[mode][id] = t; writeStore(BEST_KEY, JSON.stringify(b)); }
  // A level only sets a best time when it was finished before the clock ran out.
  function recordLevel(G, e) {
    const t = Number.isFinite(e.levelT) ? e.levelT : G.levelT, prev = bestFor(G.timerMode, G.stage);
    const newBest = !e.timedOut && (prev === null || t < prev - 1e-6);
    if (newBest) setBest(G.timerMode, G.stage, t);
    app.runLevels[G.stage] = { t, timedOut: !!e.timedOut, limit: G.levelLimit, prev, newBest, mode: G.timerMode };
    if (newBest && prev !== null) { showToast('★ New best ' + formatDuration(t)); app.audio.chime(); }
  }
  const timerPick = document.getElementById('timer-pick');
  function syncTimerPick() { for (const b of timerPick.querySelectorAll('[data-timer]')) b.setAttribute('aria-pressed', String(b.getAttribute('data-timer') === app.timerMode)); }
  timerPick.addEventListener('click', e => { const b = e.target.closest('[data-timer]'); if (!b || app.simMode) return; app.timerMode = b.getAttribute('data-timer'); writeStore(TIMER_KEY, app.timerMode); syncTimerPick(); });
  syncTimerPick();
  app.resultsOpen=false;app.completedRun=null;
  const hud=document.getElementById('run-hud'),results=document.getElementById('results');
  function readout(id,value) {const el=document.getElementById(id);if(el.textContent!==value)el.textContent=value;}
  function updateRunHud() {
    hud.classList.toggle('hidden',!app.running||app.resultsOpen||!!app.finale||!!app.G.overview);
    const s=summarizeRun(app.run),town=app.G.stage==='town';
    readout('hud-form',town?'Tornado':'Black hole');
    readout('hud-time',formatDuration(town?s.tornadoSeconds:s.blackholeSeconds));
    readout('hud-total',formatDuration(s.totalSeconds));
    readout('hud-mass',(town?'Farm city consumed: ':'Game universe consumed: ')+formatPercent(town?s.tornadoPercent:s.blackholePercent));
    updateLevelClock();
  }
  const countdownEl = document.getElementById('countdown'), ringEl = document.getElementById('countdown-ring'), arrowEl = document.getElementById('goal-arrow'), hudClock = document.getElementById('hud-clock');
  const RING = 276.46, _gv = new THREE.Vector3(); app.lastCount = null;
  const TIMER_NAMES = { quick: 'Quick', normal: 'Normal', adult: '5 min' };
  function updateLevelClock() {
    const G = app.G, T = TUNING, left = Math.max(0, G.levelLimit - G.levelT);
    const live = app.running && !app.resultsOpen && !app.finale && !G.overview;
    readout('hud-left', G.won ? 'done' : formatDuration(Math.ceil(left - 1e-9)));
    const best = bestFor(G.timerMode, G.stage); readout('hud-best', best === null ? '–' : formatDuration(best));
    hudClock.classList.toggle('low', !G.won && left <= T.SUPER_SIZE_AT_S);
    const showCd = live && !G.won && left <= T.SUPER_SIZE_AT_S;
    countdownEl.classList.toggle('hidden', !showCd);
    if (showCd) {
      const n = Math.ceil(left - 1e-9);
      if (n !== app.lastCount) { app.lastCount = n; readout('countdown-n', String(n)); countdownEl.classList.remove('beat'); void countdownEl.offsetWidth; countdownEl.classList.add('beat'); if (n > 0) app.audio.countTick(n); }
      ringEl.setAttribute('stroke-dashoffset', String(RING * (1 - left / T.SUPER_SIZE_AT_S)));
    } else app.lastCount = null;
    // goal arrow: once super-sized, point at the goal (bob above it on screen, or ride the screen edge toward it)
    const g = G.goalRef, showArrow = live && G.superSized && !G.won && g && g.state === 0;
    arrowEl.classList.toggle('hidden', !showArrow);
    if (!showArrow) return;
    // Keep clear of the countdown ring (top centre) and the HUD: the arrow's box is inset from every edge, deepest at the top.
    const W = app.R.width, H = app.R.height, m = 56, top = 150;
    _gv.set(g.x, g.size * 0.6, g.z).project(app.R.camera);
    let x = (_gv.x + 1) / 2 * W, y = (1 - _gv.y) / 2 * H; const behind = _gv.z > 1; if (behind) { x = W - x; y = H - y; }
    let deg;
    if (!behind && x > m && x < W - m && y > top + 60 && y < H - m) { y -= 60 + 10 * Math.abs(Math.sin(performance.now() / 180)); deg = 180; }
    else {
      const cx = W / 2, cy = (top + H - m) / 2, dx = x - cx || 1e-6, dy = y - cy || 1e-6;
      const k = Math.min((W / 2 - m) / Math.abs(dx), (dy < 0 ? cy - top : H - m - cy) / Math.abs(dy));
      x = cx + dx * k; y = cy + dy * k; deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    }
    arrowEl.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${deg.toFixed(1)}deg)`;
  }
  function showResults() {
    const s=app.completedRun;lift();app.resultsOpen=true;app.acc=0;
    if (!app.simMode) window.TwistyMetrics?.results('universe',6);
    for(const [id,value] of [['tornado-time',formatDuration(s.tornadoSeconds)],['blackhole-time',formatDuration(s.blackholeSeconds)],['total-time',formatDuration(s.totalSeconds)],['tornado-mass',formatPercent(s.tornadoPercent)],['blackhole-mass',formatPercent(s.blackholePercent)],['total-mass',formatPercent(s.totalPercent)]])document.getElementById('result-'+id).textContent=value;
    fillLevelTable(app.completedLevels||{});
    // the 5-minute setting ends the other way round: the biggest black hole pulls you in
    document.getElementById('results-title').textContent = app.completedSwallowed ? 'Swallowed by the black hole!' : 'What a whirlwind!';
    document.getElementById('results-subtitle').textContent = app.completedSwallowed ? 'You reached the biggest black hole, and it was hungrier than you' : 'Your journey from farm city to universe';
    results.classList.remove('hidden');app.audio.setPaused(true);updateRunHud();document.getElementById('play-again').focus();
  }
  const worldCard = document.getElementById('world-card'), toastEl = document.getElementById('toast');
  // ---- sound on/off: a parent control in the corner, remembered on this device ----
  const MUTE_KEY = 'twisty-mute-v1', muteBtn = document.getElementById('mute');
  app.muted = readStore(MUTE_KEY, '0') === '1';
  function syncMute() { muteBtn.setAttribute('aria-pressed', String(app.muted)); muteBtn.setAttribute('aria-label', app.muted ? 'Turn sound on' : 'Turn sound off'); muteBtn.textContent = app.muted ? '🔇' : '🔊'; app.audio.setMuted(app.muted); }
  muteBtn.addEventListener('click', e => { e.stopPropagation(); app.muted = !app.muted; writeStore(MUTE_KEY, app.muted ? '1' : '0'); syncMute(); });
  syncMute();
  // ---- adaptive quality: if frames run long for a while, step the backing resolution down; step back up when there is headroom.
  // Keeps touch response and motion smooth on an older iPad. ?quality=fixed pins full quality (the graphics gate measures that path).
  const fixedQuality = /(^|[?&])quality=fixed(&|$)/.test(location.search);
  const QUALITY = [1, 0.8, 0.66, 0.55]; // fractions of the starting pixel ratio
  app.quality = { level: 0, ema: 1 / 60, slow: 0, fast: 0, base: 0 };
  function adaptQuality(dt) {
    if (fixedQuality || app.simMode || !(dt > 0) || dt > 0.25) return;
    const q = app.quality; if (!q.base) q.base = app.R.renderer.getPixelRatio();
    q.ema += (dt - q.ema) * 0.05;
    if (q.ema > 1 / 40) { q.slow++; q.fast = 0; } else if (q.ema < 1 / 56) { q.fast++; q.slow = 0; } else { q.slow = 0; q.fast = 0; }
    let to = q.level;
    if (q.slow > 120 && q.level < QUALITY.length - 1) to = q.level + 1;
    else if (q.fast > 600 && q.level > 0) to = q.level - 1;
    if (to === q.level) return;
    q.level = to; q.slow = 0; q.fast = 0; q.ema = 1 / 60;
    app.R.renderer.setPixelRatio(q.base * QUALITY[to]); onResize();
  }
  function showWorldCard(theme) {
    const info = themeInfo(theme); if (!info || app.simMode) return;
    worldCard.querySelector('.icon').textContent = info.icon; worldCard.querySelector('.name').textContent = info.name;
    worldCard.classList.add('hidden'); void worldCard.offsetWidth; worldCard.classList.remove('hidden');
    clearTimeout(showWorldCard.t); showWorldCard.t = setTimeout(() => worldCard.classList.add('hidden'), 3300);
  }
  function showToast(text) {
    toastEl.textContent = text; toastEl.classList.add('hidden'); void toastEl.offsetWidth; toastEl.classList.remove('hidden');
    clearTimeout(showToast.t); showToast.t = setTimeout(() => toastEl.classList.add('hidden'), 2700);
  }
  const LEVEL_NAMES = [['town', 'Farm city'], ['solar', 'Solar system'], ['galaxy', 'Galaxy'], ['universe', 'Universe']];
  function fillLevelTable(levels) {
    const body = document.getElementById('result-levels-body'); body.textContent = '';
    const mode = (levels.town && levels.town.mode) || app.timerMode;
    document.getElementById('result-levels-title').textContent = 'Level times · ' + (TIMER_NAMES[mode] || mode);
    const row = (name, now, best, star) => { const tr = document.createElement('tr'); for (const [txt, cls] of [[name], [now], [best, star ? 'star' : '']]) { const td = document.createElement('td'); td.textContent = txt; if (cls) td.className = cls; tr.appendChild(td); } body.appendChild(tr); };
    let total = 0, complete = true, clean = true;
    for (const [id, name] of LEVEL_NAMES) {
      const L = levels[id], b = bestFor(mode, id), fb = b === null ? '–' : formatDuration(b); if (!L) { complete = false; row(name, '–', fb, false); continue; }
      total += L.t; if (L.timedOut) clean = false;
      row(name, formatDuration(L.t) + (L.timedOut ? ' ⏱' : ''), fb + (L.newBest ? ' ★' : ''), L.newBest);
    }
    const stars = document.getElementById('result-stars'); stars.textContent = '';
    for (const [id, name] of LEVEL_NAMES) { const L = levels[id], on = !!L && !L.timedOut, sp = document.createElement('span'); sp.className = on ? 'on' : 'off'; sp.textContent = on ? '★' : '☆'; sp.title = name; stars.appendChild(sp); }
    { const sm = document.createElement('small'); sm.textContent = 'beat the clock'; stars.appendChild(sm); }
    const next = themeInfo(app.G.theme); document.getElementById('next-world').textContent = next ? 'Next world: ' + next.icon + ' ' + next.name : '';
    // a run the clock had to finish still shows its total, but only a run that beat every clock can set the best
    if (complete) { const prev = bestFor(mode, 'run'), nb = clean && (prev === null || total < prev - 1e-6); if (nb) setBest(mode, 'run', total); row('Whole run', formatDuration(total), nb ? formatDuration(total) + ' ★' : prev === null ? '–' : formatDuration(prev), nb); }
  }
  document.getElementById('play-again').addEventListener('click',()=>{
    setTimeout(() => showWorldCard(app.G.theme), 250);
    if (!app.simMode) window.TwistyMetrics?.replay(app.G.stage,app.G.tier);
    app.resultsOpen=false;app.completedRun=null;results.classList.add('hidden');app.audio.setPaused(false);lift();app.last=performance.now();app.acc=0;updateRunHud();
  });
  const fadeEl = document.getElementById('fade');
  function setFade(opacity, white) { if (!fadeEl) return; fadeEl.style.background = white ? '#ffffff' : '#000000'; fadeEl.style.opacity = String(clamp(opacity, 0, 1)); }
  // The ending: fall into the black hole, black, the white of a new universe, and she is a small tornado on a new Earth.
  function stepFinale(elapsed) {
    const F = app.finale, T = TUNING; F.t += elapsed;
    const tZoom = T.FINALE_ZOOM_S, tDark = tZoom + T.FINALE_DARK_S, tEnd = tDark + T.FINALE_FLASH_S;
    if (F.t < tZoom) { const k = F.t / tZoom; app.R.setFinale(k); setFade(clamp((k - 0.55) / 0.45, 0, 1), false); return; }
    if (!F.reborn) { F.reborn = true; app.R.setFinale(0); nextStage(); setFade(1, false); return; }
    if (F.t < tDark) { setFade(1, false); return; }
    if (!F.flashed) { F.flashed = true; app.G.emit('stage', { stage: app.G.stage, reborn: true }); }
    if (F.t < tEnd) { setFade(1 - (F.t - tDark) / T.FINALE_FLASH_S, true); return; }
    setFade(0, false); app.finale = null;showResults();
  }
  function onResize() {
    if (!app.R) return;
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    app.R.resize(w, h);
    if(app.resultsOpen){app.R.update(app.G,0);app.R.render();}
  }
  window.addEventListener('resize', onResize);
  document.getElementById('space-map').addEventListener('click',()=>{
    if(!app.G||app.G.stage==='town'||app.resultsOpen||app.finale)return;
    app.G.overview=!app.G.overview;lift();app.acc=0;
    const button=document.getElementById('space-map');button.setAttribute('aria-pressed',String(app.G.overview));button.setAttribute('aria-label',app.G.overview?'Return to game':'Show space overview');
    const caption=document.getElementById('map-caption'),copy={solar:['The Solar System','Eight planets · One star · Worlds in motion'],galaxy:['The Milky Way','Our home galaxy · A barred spiral of stars, gas and dust'],universe:['The Cosmic Web','Galaxies gather in clusters and filaments around immense voids']}[app.G.stage];
    caption.querySelector('h1').textContent=copy[0];caption.querySelector('p').textContent=copy[1];caption.classList.toggle('hidden',!app.G.overview);document.getElementById('map-note').classList.toggle('hidden',!app.G.overview);
    app.R.update(app.G,0);app.R.render();
    app.last=performance.now();updateRunHud();
  });
  window.addEventListener('orientationchange', () => setTimeout(onResize, 50));

  // ---- touch input (one finger, always) ----
  const touchOpts = { passive: false };
  function tp(e) { const t = e.touches && e.touches.length ? e.touches[0] : (e.changedTouches && e.changedTouches[0]); return t; }
  canvas.addEventListener('touchstart', e => { e.preventDefault(); const t = tp(e); if (t && !app.simMode) setTouch(t.clientX, t.clientY); }, touchOpts);
  canvas.addEventListener('touchmove', e => { e.preventDefault(); const t = tp(e); if (t && !app.simMode) setTouch(t.clientX, t.clientY); }, touchOpts);
  canvas.addEventListener('touchend', e => { e.preventDefault(); if (!e.touches || e.touches.length === 0) { if (!app.simMode) lift(); } }, touchOpts);
  canvas.addEventListener('touchcancel', e => { e.preventDefault(); if (!app.simMode) lift(); }, touchOpts);
  // mouse fallback for desktop testing only (iPad uses touch)
  let mouseDown = false;
  canvas.addEventListener('mousedown', e => { if (app.simMode) return; mouseDown = true; setTouch(e.clientX, e.clientY); });
  window.addEventListener('mousemove', e => { if (mouseDown && !app.simMode) setTouch(e.clientX, e.clientY); });
  window.addEventListener('mouseup', () => { mouseDown = false; if (!app.simMode) lift(); });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (e.target !== canvas&&!e.target.closest('#results')) e.preventDefault(); }, touchOpts);
  document.addEventListener('visibilitychange',()=>{app.last=performance.now();app.acc=0;lift();app.audio.setPaused(document.hidden||app.resultsOpen);});

  // ---- WebGL context loss ----
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); app.contextLost = true; }, false);
  canvas.addEventListener('webglcontextrestored', () => { app.contextLost = false; app.last = performance.now(); }, false);

  // ---- live loop: fixed-timestep logic, render every frame ----
  function frame(now) {
    if (!app.running) return;
    app.raf = requestAnimationFrame(frame);
    if (app.contextLost||document.hidden||app.resultsOpen) {app.last=now;app.acc=0;return;}
    const G = app.G;
    const activeSeconds=Math.max(0,(now-app.last)/1000);
    let elapsed = Math.min(0.1, activeSeconds); app.last = now;
    adaptQuality(activeSeconds);
    if(G.overview){updateOrbits(G,elapsed);app.R.update(G,elapsed);app.R.render();updateRunHud();return;}
    if(!app.finale){advanceRunTime(app.run,G.stage,activeSeconds);if(!app.simMode)window.TwistyMetrics?.tick(activeSeconds,G.stage,G.tier);}
    if(!app.finale){
      app.acc += elapsed;
      let n = 0;
      while (app.acc >= DT && n < 4) { stepGame(G); app.acc -= DT; n++; }
      if (n === 4) app.acc = 0;
    }else app.acc=0;
    if (app.finale) { stepFinale(elapsed); if (app.finale && app.finale.reborn && app.G !== G) return; }
    else if (G.won && G.time - G.winT > (G.stageDef.last ? 2.5 : 6)) { if (G.stageDef.last) {app.completedRun=summarizeRun(app.run);app.completedLevels=app.runLevels;app.completedSwallowed=!!G.swallowed;lift();app.finale = { t: 0, reborn: false, flashed: false };} else { nextStage(); return; } }
    const Gn = app.G; app.R.update(Gn, elapsed); app.audio.update(Gn); app.R.render();
    updateRunHud();
  }
  function startLive() {
    app.resultsOpen=false;app.completedRun=null;results.classList.add('hidden');
    app.finale = null; setFade(0, false); if (app.R) app.R.setFinale(0);
    try { if (!app.G || app.G.won || app.G.stage !== 'town' || app.G.colorId !== app.colorId || app.G.timerMode !== app.timerMode) { newGame((Date.now() % 100000) | 0, {}); app.winShown = false; } }
    catch (e) { console.error('start failed', e); showFailure('This viewer could not start 3D graphics (' + String(e && e.message || e).slice(0, 80) + ').'); return; }
    startEl.classList.add('hidden');
    showWorldCard(app.G.theme);
    setTimeout(() => { const r = document.getElementById('rotate'); if (r) r.classList.add('hidden'); }, 4000);
    app.audio.start();
    app.audio.setPaused(false); app.audio.setMuted(app.muted);
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not fullscreen */ }
    app.running = true; app.last = performance.now(); app.acc = 0;
    cancelAnimationFrame(app.raf); app.raf = requestAnimationFrame(frame);
  }
  // Start = pick a color. Five discs; tapping one is the single start tap.
  function pickFrom(e) { const d = e.target && e.target.closest ? e.target.closest('[data-color]') : null; if (d) app.colorId = d.getAttribute('data-color'); return !!d; }
  startEl.addEventListener('touchend', e => { if (e.target.closest('#metrics-parent,#timer-pick')) return; e.preventDefault(); if (app.simMode || !pickFrom(e)) return; startLive(); }, touchOpts);
  startEl.addEventListener('click', e => { if (e.target.closest('#metrics-parent,#timer-pick') || app.simMode || !pickFrom(e)) return; startLive(); });
  window.TwistyMetrics?.initUI();

  // First paint (scene visible behind the start disc). If 3D cannot start here, say so instead of a dead disc.
  function showFailure(msg) {
    const f = document.getElementById('fail'); if (!f) return;
    f.innerHTML = msg + '<br>Open the game in Safari: <a href="https://bensl84.github.io/twistys-tornado/" style="color:#ffd447;font-size:22px;">bensl84.github.io/twistys-tornado</a>';
    f.classList.remove('hidden'); startEl.classList.add('hidden');
  }
  try { newGame(1, {}); app.R.render(); }
  catch (e) { console.error('boot failed', e); showFailure('This viewer could not start 3D graphics (' + String(e && e.message || e).slice(0, 80) + ').'); }

  // =====================================================================================================
  // SELF-TEST HARNESS — window.__sim(seed, seconds, opts) -> telemetry JSON.
  // Fixed timestep, deterministic seed, scripted bot through the real touch path. opts.render=false runs
  // logic-only (fast) and reports frame metrics as null.
  // =====================================================================================================
  window.__sim = async function (seed, seconds, opts) {
    opts = Object.assign({ render: true, dpr: 1.5, stopOnWin: true, warmupS: 2, heapWarmupS: 15, latencyProbes: [400, 2400, 5400], yieldEvery: 900 }, opts || {});
    cancelAnimationFrame(app.raf); app.running = false; app.simMode = true; startEl.classList.add('hidden');
    app.resultsOpen=false;app.completedRun=null;app.finale=null;results.classList.add('hidden');hud.classList.add('hidden');setFade(0,false);
    if (opts.tuning) for (const k in opts.tuning) { if (typeof TUNING[k] === 'object' && !Array.isArray(TUNING[k])) Object.assign(TUNING[k], opts.tuning[k]); else TUNING[k] = opts.tuning[k]; }
    const errBefore = consoleErrors;
    const prevTimerMode = app.timerMode; app.timerMode = TUNING.LEVEL_TIMERS[opts.timerMode] ? opts.timerMode : TUNING.LEVEL_TIMER_DEFAULT;
    if (opts.slowBot === true) opts.slowBot = { cycle: 300, duty: 0.35 }; // a child who drags for ~2 s, then stops to look for ~3 s
    if (app.R && app.R.renderer.getPixelRatio() !== Math.min(opts.dpr, TUNING.MAX_DPR)) app.R.renderer.setPixelRatio(Math.min(opts.dpr, TUNING.MAX_DPR));
    newGame(seed, Object.assign({}, opts, { theme: opts.theme || null }));
    let G = app.G; const R = app.R;
    const _pv = new THREE.Vector3();
    const view = { get width() { return R.width; }, get height() { return R.height; }, project(x, y, z, out) { const v = _pv.set(x, y, z).project(R.camera); out.ok = v.z < 1 && v.z > -1; out.x = (v.x + 1) / 2 * R.width; out.y = (1 - v.y) / 2 * R.height; return out; } };
    let bot = createBot(G, view);
    app.bot = bot; app.view = view;
    // later-stage accumulators, one per stage after the town (the gate metrics above are town-only)
    const stagesRes = {}; let space = null; // space = the accumulator of the current non-town stage
    const newStageAcc = () => ({ started: null, wonAt: null, absorbs: 0, tierUps: 0, rattles: 0, absorbTimes: [], lastObjEventT: 0, maxDead: 0, visTicks: 0, visSeen: 0, heapGrowthPct: null, finalTier: null, finalPower: null });
    let townWinTick = null, townWinT = null, townSnap = null; // townWinT is simulated time (G.time: scaled by slow-mo, paused in hitstop), the clock absorbTimes use
    const maxTicks = Math.round(seconds / DT);
    // telemetry accumulators
    const capTicks = Math.min(maxTicks + 2, 60 * 3600 * 2); // telemetry buffers: at most two hours of ticks
    const frameTimes = new Float32Array(capTicks), cpuTimes = new Float32Array(capTicks); let nFrame = 0, nCpu = 0;
    let nanCount = 0, ticksTooBigVisible = 0, ticksCounted = 0;
    let lastFeedbackT = 0, maxFeedbackGap = 0, lastActiveT = -1;
    let lastObjEventT = 0, maxDeadtime = 0, maxDeadAt = 0; const visByTier = {};
    let firstAbsorbT = null;
    const absorbTimes = [], attempts = [], attemptsPreWin = [], rollingRates = [], rollingAll = []; let conversions = 0;
    const latencies = []; let probe = null;
    const heap = () => (performance.memory ? performance.memory.usedJSHeapSize : null);
    let heapStart = null; const heapSeries = []; let heapStageT0 = 0, heapTownGrowth = null; const heapByStage = {};
    const tierUpTimes = []; const phases = [{ tier: 1, t0: 0, absorbs: 0, rattles: 0, dust: 0, types: {} }]; const rollingAt = [];
    const townListener = e => {
      if (e.kind === 'absorb') { absorbTimes.push(e.t); if (firstAbsorbT === null) firstAbsorbT = e.t; if (e.conversion) conversions++; attempts.push(1); if (G.tier < 6) attemptsPreWin.push(1); }
      if (e.kind === 'rattle') { attempts.push(0); if (G.tier < 6) attemptsPreWin.push(0); }
      if (e.kind === 'tierup') { tierUpTimes.push(e.t); phases.push({ tier: e.tier, t0: e.t, absorbs: 0, rattles: 0, dust: 0, types: {} }); }
      const ph = phases[phases.length - 1]; if (e.kind === 'absorb') { ph.absorbs++; const ty = G.objs[e.id].type.id; ph.types[ty] = (ph.types[ty] || 0) + 1; } else if (e.kind === 'rattle') ph.rattles++; else if (e.kind === 'dust') ph.dust++;
      if (attempts.length >= 20 && (e.kind === 'absorb' || e.kind === 'rattle')) { let s = 0; for (let i = attempts.length - 20; i < attempts.length; i++) s += attempts[i]; rollingAll.push(s / 20); rollingAt.push(+e.t.toFixed(0)); if (G.tier < 6) rollingRates.push(s / 20); }
      if (e.kind === 'absorb' || e.kind === 'dust' || e.kind === 'rattle' || e.kind === 'sway' || e.kind === 'tierup' || e.kind === 'win') { lastObjEventT = e.t; }
      if (e.kind !== 'pull') { lastFeedbackT = e.t; }
    };
    G.listeners.push(townListener);
    const makeStageListener = acc => e => {
      if (e.kind === 'absorb') { acc.absorbs++; acc.absorbTimes.push(e.t); }
      if (e.kind === 'rattle') acc.rattles++;
      if (e.kind === 'tierup') acc.tierUps++;
      if (e.kind === 'absorb' || e.kind === 'dust' || e.kind === 'rattle' || e.kind === 'sway' || e.kind === 'tierup' || e.kind === 'win') acc.lastObjEventT = e.t;
      if (e.kind === 'win') acc.wonAt = e.t;
    };
    const isNum = v => typeof v === 'number' && isFinite(v);
    let winTick = null; const _visNear = []; const trace = []; const levels = {};
    const tooBigVisibleSampleEvery = 3;
    let heapT = null;
    function oneTick(realFrameMs) {
      // latency probe: flip the finger to the opposite side of the screen and count ticks until the acceleration responds
      if (opts.latencyProbes.includes(G.tick)) { probe = { start: G.tick, sx: G.vel.x > 0 ? R.width * 0.08 : R.width * 0.92 }; }
      if (probe) {
        const sx = probe.sx, sy = R.height * 0.5;
        if (G.tick === probe.start) { G.finger.down = false; }
        setTouch(sx, sy); // each call restamps lastInputTick; response measured against the first
        if (G.tick === probe.start) probe.inputTick = G.lastInputTick;
        if (G.lastResponseTick >= probe.inputTick && G.lastResponseTick > 0) { latencies.push(G.lastResponseTick - probe.inputTick); probe = null; G.lastResponseTick = -1; }
        else if (G.tick - probe.start > 30) { latencies.push(31); probe = null; }
      } else if (opts.slowBot && (G.tick % opts.slowBot.cycle) >= opts.slowBot.cycle * opts.slowBot.duty) lift();
      else bot.step(setTouch, lift);
      const t0 = performance.now();
      stepGame(G);
      { const L = levels[G.stage] || (levels[G.stage] = { limit: G.levelLimit, level_s: null, supersize_left: null, timed_out: false, won: false });
        if (G.superSized && L.supersize_left === null) L.supersize_left = +(G.levelLimit - G.levelT).toFixed(3);
        if (G.won && !L.won) { L.won = true; L.level_s = +G.levelWinT.toFixed(2); L.timed_out = G.timedOut; } }
      if (opts.render) { R.update(G, DT); R.render(); }
      if (nCpu < capTicks) cpuTimes[nCpu++] = performance.now() - t0;
      if (opts.trace && G.tick >= opts.trace[0] && G.tick <= opts.trace[1] && G.tick % (opts.traceEvery || 1) === 0) trace.push({ tick: G.tick, x: +G.pos.x.toFixed(2), z: +G.pos.z.toFixed(2), vx: +G.vel.x.toFixed(2), vz: +G.vel.z.toFixed(2), ax: +G.acc.x.toFixed(2), az: +G.acc.z.toFixed(2), fx: +G.finger.x.toFixed(1), fz: +G.finger.z.toFixed(1), down: G.finger.down, hs: G.hitstop, ts: +G.timeScale.toFixed(2), in: G.lastInputTick, resp: G.lastResponseTick, tgt: bot.target ? bot.target.type.id + '@' + bot.target.x.toFixed(1) + ',' + bot.target.z.toFixed(1) : null, cur: bot.curious ? bot.curious.type.id : null, P: +G.power.toFixed(1), tier: G.tier, abs: G.absorbCount });
      if (realFrameMs != null && G.time > opts.warmupS && nFrame < capTicks) frameTimes[nFrame++] = realFrameMs;
      // NaN watch
      if (!isNum(G.pos.x) || !isNum(G.pos.z) || !isNum(G.vel.x) || !isNum(G.vel.z) || !isNum(G.power) || !isNum(G.camPos.x) || !isNum(G.camPos.y) || !isNum(G.camDist)) nanCount++;
      // pull-forward rule: at least one too-big object visible
      if (G.tick % tooBigVisibleSampleEvery === 0) {
        if (!opts.render) R.update(G, DT); // camera + frustum only matter here
        let vis = false;
        const cand = G.nearby(G.camPos.x, G.camPos.z, G.camDist * TUNING.FOG_FAR_K, _visNear);
        for (let i = 0; i < cand.length; i++) { const o = cand[i]; if (o.state === 2 || (o.size <= G.power && !(G.tier >= 6 && o.type.id === G.goalId))) continue; if (R.objectVisible(o, G)) { vis = true; break; } }
        if (G.stage === 'town') { ticksCounted++; if (vis) ticksTooBigVisible++; const vt = visByTier[G.tier] || (visByTier[G.tier] = [0, 0]); vt[0]++; if (vis) vt[1]++; }
        else { space.visTicks++; if (vis) space.visSeen++; }
      }
      if (G.stage === 'town') {
        // feedback gap during active play
        const active = G.finger.down || G.speed > TUNING.IDLE_SPEED;
        if (active) { if (lastActiveT < 0) { lastActiveT = G.time; lastFeedbackT = Math.max(lastFeedbackT, G.time); } const gap = G.time - lastFeedbackT; if (gap > maxFeedbackGap) maxFeedbackGap = gap; }
        else lastActiveT = -1;
        const dead = G.time - lastObjEventT; if (dead > maxDeadtime) { maxDeadtime = dead; maxDeadAt = G.time; }
      } else { const dead = G.time - space.lastObjEventT; if (dead > space.maxDead) space.maxDead = dead; }
      if (heapStart === null && G.time > heapStageT0 + opts.heapWarmupS) { if (window.gc) window.gc(); heapStart = heap(); heapT = G.time; }
      if (G.tick % 3600 === 0) { if (window.gc) window.gc(); const h = heap(); if (h) heapSeries.push(+(h / 1048576).toFixed(2)); }
      if (G.won && winTick === null) winTick = G.tick;
      // stage transition: 120 ticks after the goal, the next stage (unless a one-stage run was asked for). The last stage ends the run.
      if (G.won && !G.stageDef.last && opts.stages !== 1 && G.tick - winTick > 120) {
        if (G.stage === 'town') { townWinTick = winTick; townWinT = G.winT; townSnap = { tierUps: G.tierUps, tier: G.tier, power: G.power, left: G.objs.filter(o => o.state === 0).length, total: G.objs.length }; }
        const carryTick = G.tick, carryTime = G.time;
        if (space) { space.finalTier = G.tier; space.finalPower = G.power; }
        if (heapStart) { if (window.gc) window.gc(); const h = heap(); if (h) { const g = +((h - heapStart) / heapStart * 100).toFixed(2); if (G.stage === 'town') heapTownGrowth = g; heapByStage[G.stage] = g; } } heapStart = null; heapStageT0 = G.time; // a new heap window per stage (each world is a one-time step, not a leak)
        nextStage(); G = app.G; bot = createBot(G, view); app.bot = bot;
        G.tick = carryTick; G.time = carryTime; // one continuous clock for the session
        space = stagesRes[G.stage] = newStageAcc(); space.started = G.time; space.lastObjEventT = G.time; winTick = null;
        G.listeners.push(makeStageListener(space));
      }
    }
    if (opts.render && opts.renderFrom) {
      const saveRender = opts.render; opts.render = false;
      while (G.tick < opts.renderFrom && G.tick < maxTicks && !(G.won && G.stageDef.last)) { oneTick(null); if (G.tick % opts.yieldEvery === 0) await new Promise(r => setTimeout(r, 0)); }
      opts.render = saveRender; nCpu = 0; nFrame = 0;
    }
    if (opts.render) {
      await new Promise(resolve => {
        let last = performance.now(), first = true;
        function f(now) {
          const ms = first ? null : now - last; last = now; first = false;
          oneTick(ms);
          if (G.tick >= maxTicks || (opts.stopOnWin && G.won && (G.stageDef.last || opts.stages === 1) && G.tick - winTick > 120)) resolve(); else requestAnimationFrame(f);
        }
        requestAnimationFrame(f);
      });
    } else {
      while (G.tick < maxTicks && !(opts.stopOnWin && G.won && (G.stageDef.last || opts.stages === 1) && winTick !== null && G.tick - winTick > 120)) {
        oneTick(null);
        if (G.tick % opts.yieldEvery === 0) await new Promise(r => setTimeout(r, 0));
      }
    }
    if (window.gc) window.gc();
    const heapEnd = heap();
    // ---- derive metrics ----
    const sorted = Array.from(frameTimes.subarray(0, nFrame)).sort((a, b) => a - b);
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null;
    const cpuSorted = Array.from(cpuTimes.subarray(Math.min(120, Math.max(0, nCpu - 1)), nCpu)).sort((a, b) => a - b);
    const endT = G.time;
    // absorbs per minute: rolling 60 s windows sampled every 15 s once 60 s have elapsed
    const apm = [];
    const townEndT = townWinT !== null ? townWinT : endT; // town rate windows stop at the town win (same clock as absorbTimes); space has its own series
    for (let t = 60; t <= townEndT + 1e-9; t += 15) { let c = 0; for (const a of absorbTimes) if (a > t - 60 && a <= t) c++; apm.push({ t: Math.round(t), apm: c }); }
    if (!apm.length) { apm.push({ t: Math.round(townEndT), apm: absorbTimes.length / Math.max(townEndT, 1) * 60 }); }
    const rr = rollingRates;
    const result = {
      seed, seconds_requested: seconds, ticks: G.tick, sim_seconds: +endT.toFixed(2), rendered: !!opts.render, dpr: R.renderer.getPixelRatio(), viewport: [R.width, R.height],
      fps_mean: sorted.length ? +(1000 / mean(sorted)).toFixed(1) : null,
      fps_p99_frametime_ms: sorted.length ? +pct(sorted, 0.99).toFixed(1) : null,
      cpu_frame_ms_mean: cpuSorted.length ? +mean(cpuSorted).toFixed(2) : null, cpu_frame_ms_p99: cpuSorted.length ? +pct(cpuSorted, 0.99).toFixed(2) : null,
      console_errors: consoleErrors - errBefore, console_error_samples: errors.slice(-5),
      heap_growth_pct: (heapStart && heapEnd) ? +((heapEnd - heapStart) / heapStart * 100).toFixed(2) : null, heap_growth_town_pct: heapTownGrowth, heap_start_mb: heapStart ? +(heapStart / 1048576).toFixed(1) : null, heap_end_mb: heapEnd ? +(heapEnd / 1048576).toFixed(1) : null, heap_window_s: heapT != null ? +(endT - heapT).toFixed(0) : null, heap_series_mb: heapSeries,
      input_latency_frames: latencies.length ? Math.max(...latencies) : null, input_latency_samples: latencies,
      nan_count: nanCount,
      time_to_first_absorb_s: firstAbsorbT === null ? null : +firstAbsorbT.toFixed(2),
      absorbs_total: absorbTimes.length,
      absorbs_per_min_series: apm.map(x => x.apm), absorbs_per_min_min: Math.min(...apm.map(x => x.apm)), absorbs_per_min_max: Math.max(...apm.map(x => x.apm)),
      attempts_total: attempts.length,
      attempt_success_rate_rolling: rr.length ? { mean: +mean(rr).toFixed(3), min: +Math.min(...rr).toFixed(3), max: +Math.max(...rr).toFixed(3), windows: rr.length, note: 'windows before the win tier; at tier 6 everything is edible by design' } : null,
      attempt_success_rate_rolling_incl_win_tier: rollingAll.length ? { mean: +mean(rollingAll).toFixed(3), min: +Math.min(...rollingAll).toFixed(3), max: +Math.max(...rollingAll).toFixed(3), windows: rollingAll.length } : null,
      attempt_success_rate_overall: attempts.length ? +(attempts.reduce((a, b) => a + b, 0) / attempts.length).toFixed(3) : null,
      phase_stats: phases.map((p, i) => { const t1 = i + 1 < phases.length ? phases[i + 1].t0 : endT; const dur = t1 - p.t0; return { tier: p.tier, dur_s: +dur.toFixed(0), absorbs: p.absorbs, apm: +(p.absorbs / Math.max(dur, 1) * 60).toFixed(1), rattles: p.rattles, dust: p.dust, types: p.types }; }),
      bot_stats: bot.stats, success_windows_at_100pct: rollingAll.map((r, i) => r >= 1 ? rollingAt[i] : null).filter(x => x !== null),
      counts_by_type: (() => { const c = {}; for (const o of G.objs) c[o.type.id] = (c[o.type.id] || 0) + 1; return c; })(),
      tier_ups: townSnap ? townSnap.tierUps : G.tierUps, tier_up_times_s: tierUpTimes.map(t => +t.toFixed(1)), tier_up_intervals_s: tierUpTimes.map((t, i) => +(t - (i ? tierUpTimes[i - 1] : 0)).toFixed(0)), final_tier: townSnap ? townSnap.tier : G.tier, final_power_m: +(townSnap ? townSnap.power : G.power).toFixed(2),
      max_deadtime_s: +maxDeadtime.toFixed(2), max_deadtime_at_s: +maxDeadAt.toFixed(1),
      frames_with_visible_too_big_pct: ticksCounted ? +(ticksTooBigVisible / ticksCounted * 100).toFixed(2) : null, too_big_visible_by_tier: Object.fromEntries(Object.entries(visByTier).map(([k, v]) => [k, +(v[1] / v[0] * 100).toFixed(1)])),
      obstacle_to_food_conversions: conversions,
      max_feedback_gap_s: +maxFeedbackGap.toFixed(2),
      session_length_to_win_s: townWinTick !== null ? +(townWinTick * DT).toFixed(1) : (G.stage === 'town' && G.won ? +G.winT.toFixed(1) : null),
      won: townWinTick !== null || (G.stage === 'town' && G.won), trace,
      stages: Object.fromEntries(Object.entries(stagesRes).map(([id, acc]) => { const t0 = acc.started, t1 = acc.wonAt !== null ? acc.wonAt : endT; const apm = []; for (let t = t0 + 60; t <= t1 + 1e-9; t += 15) { let c = 0; for (const a of acc.absorbTimes) if (a > t - 60 && a <= t) c++; apm.push(c); } return [id, { won: acc.wonAt !== null, length_s: +(t1 - t0).toFixed(1), absorbs: acc.absorbs, rattles: acc.rattles, tier_ups: acc.tierUps, apm_series: apm, max_deadtime_s: +acc.maxDead.toFixed(2), too_big_visible_pct: acc.visTicks ? +(acc.visSeen / acc.visTicks * 100).toFixed(1) : null, heap_growth_pct: heapByStage[id] === undefined ? null : heapByStage[id], final_tier: acc.finalTier, final_power: acc.finalPower === null ? null : +acc.finalPower.toFixed(0) }]; })),
      space: null, // filled below: the solar record, same shape as the old space block (kept for old scripts; see `stages`)
      objects_total: townSnap ? townSnap.total : G.objs.length, objects_left: townSnap ? townSnap.left : G.objs.filter(o => o.state === 0).length,
    };
    // the stage still running at the end: its heap window ends at the run's end, its tier and power are the current ones
    if (G.stage !== 'town' && result.stages[G.stage]) { const cur = result.stages[G.stage]; if (cur.heap_growth_pct === null) cur.heap_growth_pct = result.heap_growth_pct; if (cur.final_tier === null) { cur.final_tier = G.tier; cur.final_power = +G.power.toFixed(0); } }
    result.space = result.stages.solar || null;
    result.timer_mode = app.timerMode; result.slow_bot = !!opts.slowBot; result.levels = levels;
    app.timerMode = prevTimerMode;
    app.simMode = false;
    return result;
  };
  window.__state = () => ({ stage: app.G.stage, color: app.G.colorId, tick: app.G.tick, time: app.G.time, power: app.G.power, tier: app.G.tier, pos: app.G.pos, vel: app.G.vel, absorbs: app.G.absorbCount, won: app.G.won, lastInputTick: app.G.lastInputTick, lastResponseTick: app.G.lastResponseTick, errors });
  window.__startLive = startLive;
  window.__nextStage = nextStage;
  window.__jumpStage = id => { newGame(app.G ? app.G.seed : 1, {}, id); app.G.emit('stage', { stage: app.G.stage }); };
  window.__finishStage = () => { const G = app.G; if (G.goalRef && G.goalRef.state !== 2) { G.power = G.goalSize * 1.05; G.tier = 6; finishAbsorb(G, G.goalRef); } };
  window.__fade = () => (fadeEl ? Number(fadeEl.style.opacity || 0) : null);
  window.__app = app;
  window.__TUNING = TUNING;
}

