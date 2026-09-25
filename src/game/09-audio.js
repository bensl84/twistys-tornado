// =====================================================================================================
// AUDIO — synthesized. Wind rumble deepens with size; absorb pops pitch by size; tier-up chord; win fanfare.
// =====================================================================================================
function createAudio() {
  let ctx = null, master, windGain, windFilter, windLfo, enabled = false;
  let musicGain = null, humGain = null, musicTimer = 0, musicMode = 'town', nextNoteT = 0, noteStep = 0, noteDeg = 3, paused = false, muted = false, form = 'tornado';
  let sfxWindowT = 0, sfxCount = 0; // rate limit: a super-size feast must not start hundreds of voices at once
  function start() {
    // Idempotent: a replay reuses the existing graph instead of stacking another context and wind loop.
    if (ctx) { try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { /* ignore */ } return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = TUNING.MASTER_GAIN; master.connect(ctx.destination);
      const len = ctx.sampleRate * 2; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      windFilter = ctx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = TUNING.WIND_CUTOFF_MAX; windFilter.Q.value = 0.8;
      windGain = ctx.createGain(); windGain.gain.value = 0;
      windLfo = ctx.createOscillator(); windLfo.frequency.value = 0.6; const lfoG = ctx.createGain(); lfoG.gain.value = 0.05; windLfo.connect(lfoG); lfoG.connect(windGain.gain); windLfo.start();
      src.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); src.start();
      musicGain = ctx.createGain(); musicGain.gain.value = TUNING.MUSIC_GAIN; musicGain.connect(master);
      humGain = ctx.createGain(); humGain.gain.value = 0; humGain.connect(master);
      for (const [f, g] of [[43, 1], [64.5, 0.55], [86, 0.25]]) { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; og.gain.value = g; o.connect(og); og.connect(humGain); o.start(); }
      nextNoteT = ctx.currentTime + 0.3; musicTimer = setInterval(scheduleMusic, 90);
      if (ctx.state === 'suspended') ctx.resume();
      enabled = true;
    } catch (e) { enabled = false; }
  }
  function tone(freq, dur, type, gain, freqEnd) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'triangle'; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur + 0.05);
  }
  // ---- music: a quiet pentatonic wander; bright and quick in town, low and slow in space ----
  const SCALES = { town: { root: 60, steps: [0, 2, 4, 7, 9, 12, 14, 16], beat: 0.19, wave: 'triangle' }, space: { root: 50, steps: [0, 3, 5, 7, 10, 12, 15, 17], beat: 0.3, wave: 'sine' } };
  function note(midi, t, wave, dur, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = wave; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.05);
  }
  function scheduleMusic() {
    if (!enabled || !ctx) return;
    if (paused || muted) { nextNoteT = ctx.currentTime + 0.1; return; }
    const sc = SCALES[musicMode];
    if (nextNoteT < ctx.currentTime) nextNoteT = ctx.currentTime + 0.03;
    while (nextNoteT < ctx.currentTime + 0.3) {
      const t = nextNoteT;
      if (noteStep % 8 === 0) note(sc.root - 12 + sc.steps[noteStep % 16 === 0 ? 0 : 3], t, 'sine', sc.beat * 7, 0.5);
      if (Math.random() < 0.62) { noteDeg = clamp(noteDeg + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)], 0, sc.steps.length - 1); note(sc.root + sc.steps[noteDeg], t, sc.wave, sc.beat * 2.2, 0.45); }
      nextNoteT += sc.beat; noteStep++;
    }
  }
  function noise(gain, dur, type, freq) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur)); const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ctx.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  // What an absorbed thing is made of decides the extra layer on top of the size-pitched pop.
  const MATERIALS = [
    ['soft', /^(leaf|paper|trash|chick|gumdrop|dinoegg)$/], ['metal', /^(can|mailbox|dumpster|tramp|car|boat|rv|bus|satellite|rocket|station|helmet|knight)$/],
    ['animal', /^(puppy|sheep|pig|cow|horse|elephant|giraffe)$/], ['dino', /^(babydino|raptor|stego|trex|bronto|dragon)$/],
    ['candy', /^(lollipop|cupcake|donut|candycane|gingerhouse)$/], ['snow', /^(snowball|penguin|snowman|igloo|icecastle)$/],
    ['star', /^(g_|u_|sun|dwarfstar)/], ['stone', /^(rock_|comet|pluto|moon|mercury|mars|bigmoon|venus|earth|icemoon|neptune|uranus|gasdwarf|saturn|jupiter|giant|castle)/],
  ];
  const materialOf = id => { for (const [m, re] of MATERIALS) if (re.test(id)) return m; return 'wood'; };
  function layer(material, f, frac) {
    const g = 0.6 + 0.6 * frac;
    if (material === 'soft') noise(0.1 * g, 0.09, 'highpass', 2400);
    else if (material === 'metal') { tone(f * 2.2, 0.12, 'square', 0.05 * g, f * 2.0); tone(f * 3.3, 0.18, 'triangle', 0.05 * g); }
    else if (material === 'wood') { tone(240, 0.08, 'triangle', 0.1 * g, 170); noise(0.07 * g, 0.06, 'bandpass', 900); }
    else if (material === 'animal') tone(480, 0.16, 'sine', 0.12 * g, 920);
    else if (material === 'dino') { tone(150, 0.4, 'sawtooth', 0.06 * g, 62); noise(0.06 * g, 0.3, 'lowpass', 300); }
    else if (material === 'candy') { tone(1319, 0.18, 'sine', 0.08 * g); setTimeout(() => { try { tone(1760, 0.24, 'sine', 0.07 * g); } catch (e) { /* optional */ } }, 60); }
    else if (material === 'snow') noise(0.12 * g, 0.14, 'highpass', 3200);
    else if (material === 'stone') tone(95, 0.3, 'sine', 0.14 * g, 48);
    else if (material === 'star') { tone(1568, 0.4, 'sine', 0.05 * g); tone(2093, 0.5, 'sine', 0.035 * g); }
  }
  function budget() { const t = ctx.currentTime; if (t - sfxWindowT > 0.2) { sfxWindowT = t; sfxCount = 0; } return ++sfxCount <= 10; }
  function chime() { if (!enabled || !ctx) return; try { [1047, 1319, 1568, 2093].forEach((f, i) => setTimeout(() => tone(f, 0.5, 'sine', 0.12), i * 90)); } catch (e) { /* optional */ } }
  function applyGain() { if (ctx && master) master.gain.setTargetAtTime(paused || muted ? 0 : TUNING.MASTER_GAIN, ctx.currentTime, 0.05); }
  function setMuted(m) { muted = !!m; applyGain(); }
  function thump(gain, dur, cutoff) {
    const len = Math.floor(ctx.sampleRate * dur); const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; const g = ctx.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  function onEvent(e, G) {
    if (!enabled || !ctx) return;
    try {
      if (e.kind === 'absorb') {
        if (!budget()) return;
        const f = clamp(260 * Math.pow(1 / Math.max(e.size, 0.2), 0.55) * 1.6, 90, 1600);
        tone(f * 1.5, 0.12 + e.frac * 0.25, 'triangle', 0.18 + 0.12 * e.frac, f * 0.8);
        const o = G.objs[e.id]; if (o) layer(materialOf(o.type.id), f, e.frac);
        if (e.frac > 0.4) thump(0.25 + 0.3 * e.frac, 0.25 + 0.3 * e.frac, 180 - 100 * e.frac);
      } else if (e.kind === 'rattle') { tone(70, 0.22, 'sine', 0.25, 45); thump(0.12, 0.08, 900); }
      else if (e.kind === 'tierup') { [0, 0.09, 0.18, 0.3].forEach((d, i) => setTimeout(() => tone([523, 659, 784, 1047][i], 0.5, 'triangle', 0.22), d * 1000)); thump(0.4, 0.8, 120); }
      else if (e.kind === 'supersize') { tone(160, 1.1, 'sawtooth', 0.08, 1300); [0, 0.12, 0.24, 0.36, 0.5].forEach((d, i) => setTimeout(() => tone([392, 523, 659, 784, 1047][i], 0.7, 'triangle', 0.2), 300 + d * 1000)); thump(0.45, 1.0, 140); }
      else if (e.kind === 'timeup') { tone(900, 0.9, 'sine', 0.12, 120); thump(0.35, 0.9, 200); }
      else if (e.kind === 'swallow') { tone(320, 2.2, 'sine', 0.16, 35); tone(160, 2.2, 'triangle', 0.08, 25); thump(0.5, 1.6, 90); }
      else if (e.kind === 'win' && e.swallowed) { [0, 0.35, 0.7].forEach((d, i) => setTimeout(() => tone([220, 175, 131][i], 1.6, 'sine', 0.14, [196, 147, 98][i]), d * 1000)); thump(0.45, 2.0, 70); } // swallowed: a low falling chord, no fanfare
      else if (e.kind === 'win') { [0, 0.15, 0.3, 0.45, 0.6, 0.9, 1.2].forEach((d, i) => setTimeout(() => tone([523, 659, 784, 1047, 1319, 1568, 2093][i], 1.2, 'triangle', 0.22), d * 1000)); thump(0.5, 2.5, 150); }
      else if (e.kind === 'pull' && e.frac > 0.5) tone(180, 0.3, 'sawtooth', 0.05, 320);
      else if (e.kind === 'dust') { if (budget()) tone(900 + 600 * Math.random(), 0.05, 'sine', 0.05, 1400); }
      else if (e.kind === 'sway') thump(0.03 + 0.02 * Math.min(1, e.size / G.power), 0.12, 1200);
    } catch (err) { /* audio is optional */ }
  }
  function update(G) {
    if (!enabled || !ctx) return;
    const p01 = clamp(Math.log(G.power / TUNING.START_POWER) / Math.log(28 / TUNING.START_POWER), 0, 1);
    const spd = clamp(G.speed / (TUNING.MAX_SPEED * G.speedScale()), 0, 1);
    windFilter.frequency.value = lerp(TUNING.WIND_CUTOFF_MAX, TUNING.WIND_CUTOFF_MIN, p01) * (1 + spd * 0.6);
    form = G.stageDef.form; musicMode = G.stage === 'town' ? 'town' : 'space';
    windGain.gain.value = lerp(TUNING.WIND_GAIN_MIN, TUNING.WIND_GAIN_MAX, p01) * (0.6 + 0.4 * spd) * G.timeScale * (form === 'blackhole' ? 0.35 : 1);
    if (humGain) humGain.gain.setTargetAtTime(form === 'blackhole' ? TUNING.HUM_GAIN * (0.7 + 0.3 * spd) : 0, ctx.currentTime, 0.4);
  }
  function setPaused(p) { paused = !!p; applyGain(); }
  // Last-ten-seconds countdown: a woodblock tick that climbs in pitch toward zero.
  function countTick(n) { if (!enabled || !ctx) return; try { tone(700 + (10 - n) * 60, 0.09, 'square', 0.07, 500 + (10 - n) * 40); } catch (err) { /* optional */ } }
  return { start, onEvent, update, setPaused, setMuted, countTick, chime, get enabled() { return enabled; }, get muted() { return muted; } };
}

