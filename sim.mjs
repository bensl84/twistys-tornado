#!/usr/bin/env node
// Headless self-test runner for index.html.
// Usage: node sim.mjs [--seeds 1-5] [--seconds 600] [--render 0|1] [--dpr 1.5] [--gates] [--json out.json] [--shot dir]
// The gate table is always printed; with --gates the process exits 1 when any gate fails (for CI), otherwise it exits 0.
// Requires playwright (npm i -g playwright) with its Chromium. The page is loaded from a file:// URL with the
// browser context OFFLINE so the "runs offline from a local file" gate is exercised on every run.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  // Local install (npm i playwright next to this file), an explicit PLAYWRIGHT_PATH, or the active npm global root.
  const candidates = ['playwright', process.env.PLAYWRIGHT_PATH];
  try { candidates.push(path.join(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), 'playwright')); } catch (e) { /* npm not on PATH */ }
  for (const c of candidates.filter(Boolean)) { try { return require(c); } catch (e) { /* try next */ } }
  throw new Error('playwright not found: run `npm i playwright` in this directory or `npm i -g playwright`, or set PLAYWRIGHT_PATH');
}
const { chromium } = loadPlaywright();

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const has = name => args.includes('--' + name);
const seedSpec = opt('seeds', '1-5');
const seeds = seedSpec.includes('-') ? (() => { const [a, b] = seedSpec.split('-').map(Number); const r = []; for (let s = a; s <= b; s++) r.push(s); return r; })() : seedSpec.split(',').map(Number);
const seconds = Number(opt('seconds', 600));
const render = opt('render', '1') !== '0';
const dpr = Number(opt('dpr', 1.5));
const width = Number(opt('width', 1180)), height = Number(opt('height', 820));
const jsonOut = opt('json', null);
const shotDir = opt('shot', null);
const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(opt('file', path.join(here, 'index.html')));

const GATES = [
  ['console_errors', v => v === 0, '= 0'],
  ['fps_mean', v => v == null || v >= 50, '>= 50 (null when not rendered)'],
  ['fps_p99_frametime_ms', v => v == null || v < 33, '< 33'],
  ['input_latency_frames', v => v != null && v <= 2, '<= 2'],
  ['nan_count', v => v === 0, '= 0'],
  ['heap_growth_pct', v => v == null || v < 5, '< 5'],
  ['time_to_first_absorb_s', v => v != null && v < 8, '< 8'],
  ['absorbs_per_min_min', v => v >= 12, '>= 12'],
  ['absorbs_per_min_max', v => v <= 25, '<= 25'],
  ['attempt_success_rate_rolling', v => v && v.mean >= 0.70 && v.mean <= 0.85 && v.max < 1.0, 'mean 70-85 %, max < 100 %'],
  ['tier_ups', v => v >= 5 && v <= 7, '5-7'],
  ['tier_up_intervals_s', v => Array.isArray(v) && v.length > 0 && v.every(x => x >= 60 && x <= 100), 'each 60-100 s'],
  ['max_deadtime_s', v => v < 6, '< 6'],
  ['frames_with_visible_too_big_pct', v => v > 95, '> 95'],
  ['obstacle_to_food_conversions', v => v >= 8, '>= 8'],
  ['max_feedback_gap_s', v => v < 1.0, '< 1.0'],
  ['session_length_to_win_s', v => v != null && v >= 360 && v <= 600, '360-600'],
];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--disable-background-timer-throttling'] });
const results = [];
let networkRequests = 0;
for (const seed of seeds) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: true, isMobile: false, offline: true });
  await ctx.route('**/*', route => { const u = route.request().url(); if (u.startsWith('file:')) return route.continue(); networkRequests++; return route.abort(); });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') pageErrors.push('console.error: ' + m.text()); });
  const t0 = Date.now();
  await page.goto('file://' + htmlPath);
  await page.waitForFunction(() => typeof window.__sim === 'function');
  const res = await page.evaluate(([seed, seconds, render, dpr]) => window.__sim(seed, seconds, { render, dpr }), [seed, seconds, render, dpr]);
  res.wall_s = +((Date.now() - t0) / 1000).toFixed(1);
  res.page_errors = pageErrors;
  res.console_errors = Math.max(res.console_errors, pageErrors.length);
  if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, `seed${seed}.png`) }); }
  results.push(res);
  const fails = GATES.filter(([k, f]) => !f(res[k])).map(([k]) => k);
  console.log(`seed ${seed}: ${res.sim_seconds}s sim, ${res.wall_s}s wall, won=${res.won} at ${res.session_length_to_win_s}s, absorbs=${res.absorbs_total}, tierups=${res.tier_ups} (${res.tier_up_times_s.join(',')}), apm=[${res.absorbs_per_min_series.join(',')}], success=${JSON.stringify(res.attempt_success_rate_rolling)}, dead=${res.max_deadtime_s}, gap=${res.max_feedback_gap_s}, toobig=${res.frames_with_visible_too_big_pct}%, conv=${res.obstacle_to_food_conversions}, first=${res.time_to_first_absorb_s}s, lat=${res.input_latency_frames}, nan=${res.nan_count}, err=${res.console_errors}, fps=${res.fps_mean}/${res.fps_p99_frametime_ms}ms cpu=${res.cpu_frame_ms_mean}/${res.cpu_frame_ms_p99}ms heap=${res.heap_growth_pct}% ${JSON.stringify(res.heap_series_mb)} deadAt=${res.max_deadtime_at_s} phases=${JSON.stringify(res.phase_stats)} visTier=${JSON.stringify(res.too_big_visible_by_tier)} left=${res.objects_left}/${res.objects_total}`);
  if (fails.length) console.log(`   FAIL: ${fails.join(', ')}`); else console.log('   all gates pass');
  if (pageErrors.length) console.log('   page errors:', pageErrors.slice(0, 5));
  await ctx.close();
}
await browser.close();
console.log(`offline check: ${networkRequests} network requests attempted (must be 0)`);
{
  const rows = GATES.map(([k, f, desc]) => [k, desc, ...results.map(r => { const v = r[k]; const s = Array.isArray(v) ? v.join('/') : v && typeof v === 'object' ? `${(v.mean * 100).toFixed(0)}% (${(v.min * 100).toFixed(0)}-${(v.max * 100).toFixed(0)})` : String(v); return (f(v) ? 'PASS ' : 'FAIL ') + s; })]);
  const head = ['metric', 'gate', ...results.map(r => 'seed ' + r.seed)];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const line = r => '| ' + r.map((c, i) => String(c).padEnd(widths[i])).join(' | ') + ' |';
  console.log('\n' + line(head)); console.log('|' + widths.map(w => '-'.repeat(w + 2)).join('|') + '|'); for (const r of rows) console.log(line(r));
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
const allPass = results.every(r => GATES.every(([k, f]) => f(r[k]))) && networkRequests === 0;
console.log(allPass ? '\nALL GATES PASS' : '\nGATES FAILED');
process.exit(has('gates') && !allPass ? 1 : 0);
