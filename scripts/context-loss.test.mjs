// iPad Safari can drop the WebGL context (memory pressure, backgrounding). The game must freeze, not crash, keep the
// level clock still while the screen is blank, and resume drawing once the browser gives the context back.
// Real browser: forces a loss and restore through WEBGL_lose_context.
// Needs Playwright (`npm ci` here, or PLAYWRIGHT_PATH) and its Chromium (or BROWSER_EXECUTABLE).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let playwright; for (const c of ['playwright', process.env.PLAYWRIGHT_PATH].filter(Boolean)) { try { playwright = require(c); break; } catch { /* next */ } }
const url = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html')).href;

test('a lost WebGL context pauses the game and clock, and a restored one resumes drawing', { timeout: 240000, skip: !playwright && 'playwright not installed' }, async () => {
  const browser = await playwright.chromium.launch({
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const page = await (await browser.newContext({ viewport: { width: 480, height: 320 }, deviceScaleFactor: 0.5, offline: true })).newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${url}?quality=fixed`);
    await page.waitForFunction(() => window.__app && window.__app.G);
    await page.evaluate(() => document.querySelector('[data-color="teal"]').click());
    await page.waitForFunction(() => window.__app.running && window.__app.G.tick > 3, null, { timeout: 120000 });

    await page.evaluate(() => { window.__lose = window.__app.R.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
    await page.waitForFunction(() => window.__app.contextLost === true);
    const frozen = await page.evaluate(() => ({ tick: window.__app.G.tick, levelT: window.__app.G.levelT }));
    await page.waitForTimeout(2000);
    const still = await page.evaluate(() => ({ tick: window.__app.G.tick, levelT: window.__app.G.levelT }));
    assert.deepEqual(still, frozen, 'game and level clock stay frozen while the context is lost');

    await page.evaluate(() => window.__lose.restoreContext());
    await page.waitForFunction(() => window.__app.contextLost === false);
    await page.waitForFunction(t => window.__app.G.tick > t + 3, frozen.tick, { timeout: 120000 });
    const after = await page.evaluate(() => { const r = window.__app.R.renderer; return { lost: r.getContext().isContextLost(), triangles: r.info.render.triangles, textures: r.info.memory.textures }; });
    assert.equal(after.lost, false);
    assert.ok(after.triangles > 0, 'the scene draws again after restore');
    assert.ok(after.textures > 0, 'textures are uploaded again after restore');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
