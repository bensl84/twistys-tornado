import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { build } from './build.mjs';

test('the packaged game teaches a first pickup, pauses, and replays offline', { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'twisty-ios-'));
  try {
    const html = build('ios');
    assert.doesNotMatch(html, /<script\s+src=|navigator\.serviceWorker\.register|<link\s+rel="manifest"|id="metrics-parent"/);
    assert.match(html, /Content-Security-Policy/);
    const file = join(directory, 'index.html');
    await writeFile(file, html);
    const browser = await chromium.launch({
      ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 375, height: 667 }, deviceScaleFactor: 0.5, hasTouch: true, isMobile: true, offline: true,
        reducedMotion: 'reduce',
      });
      await page.addInitScript(() => {
        const storage = new Map();
        window.hostActions = [];
        window.twistyHost = {
          storage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
          paused: false,
          setPaused(value) {
            this.paused = value;
            document.dispatchEvent(new Event('twisty-pause'));
          },
          open(action) {
            window.hostActions.push(action);
            if (action === 'pause') this.setPaused(true);
          },
        };
      });
      const requests = [];
      const errors = [];
      page.on('request', request => requests.push(request.url()));
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

      const localURL = pathToFileURL(file).href;
      await page.goto(localURL);
      await page.waitForFunction(() => window.__app?.G);
      await page.getByRole('button', { name: 'Privacy', exact: true }).tap();
      await page.getByRole('button', { name: /^Quick:/ }).tap();
      await page.getByRole('button', { name: 'Turn sound off' }).tap();
      assert.equal(await page.evaluate(() => window.twistyHost.storage.getItem('twisty-timer-v1')), 'quick');
      assert.equal(await page.evaluate(() => window.twistyHost.storage.getItem('twisty-mute-v1')), '1');
      await page.getByRole('button', { name: 'Start with a blue tornado' }).tap();

      await page.waitForFunction(() => window.__app.G.tick > 3);
      await page.getByRole('button', { name: 'Pause game' }).tap();
      const pausedTick = await page.evaluate(() => window.__app.G.tick);
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => window.__app.G.tick), pausedTick);
      await page.evaluate(() => window.twistyHost.setPaused(false));
      await page.waitForFunction(tick => window.__app.G.tick > tick + 3, pausedTick);

      const marker = page.locator('#pickup-marker');
      await marker.waitFor({ state: 'visible' });
      const bounds = await marker.boundingBox();
      assert.ok(bounds, 'the first pickup is marked in the phone viewport');
      const starterId = await page.evaluate(() => window.__app.starterPickup.id);
      const target = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      const touch = await page.context().newCDPSession(page);
      // Capture the transient toast even if the browser is busy while the touch ends.
      await page.evaluate(() => {
        const toast = document.getElementById('toast');
        const observer = new MutationObserver(() => {
          if (toast.classList.contains('hidden') || toast.textContent !== 'Nice! Keep collecting to grow.') return;
          window.sawPickupToast = true;
          observer.disconnect();
        });
        observer.observe(toast, { attributes: true, attributeFilter: ['class'], childList: true });
      });
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x: target.x - 24, y: target.y + 24 }],
      });
      // Keep dragging toward the marker as the camera follows the player.
      for (let move = 0; move < 12; move++) {
        const { state, tick, point } = await marker.evaluate((element, id) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          const { objs, tick } = window.__app.G;
          return { state: objs[id].state, tick, point: { x: x + width / 2, y: y + height / 2 } };
        }, starterId);
        if (state !== 0) break;
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
        await page.waitForFunction(through => window.__app.G.tick >= through, tick + 8, { timeout: 8000 });
      }
      // A software-rendered browser can take longer to animate an attached pickup.
      await page.waitForFunction(id => window.__app.G.objs[id].state === 2, starterId, { timeout: 25000 });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await page.evaluate(() => window.sawPickupToast), true, 'the pickup toast appeared');
      assert.equal(await page.locator('#pickup-hint').isVisible(), false);
      assert.equal(await marker.isVisible(), false);

      await page.setViewportSize({ width: 667, height: 375 });
      await page.evaluate(() => {
        // Exercise the actual finale and results handoff without waiting on software rendering.
        window.__TUNING.FINALE_ZOOM_S = 0.01;
        window.__TUNING.FINALE_DARK_S = 0.01;
        window.__TUNING.FINALE_FLASH_S = 0.01;
        window.__jumpStage('universe');
        window.__finishStage();
        window.__app.G.winT -= 3;
      });
      const results = page.getByRole('dialog', { name: 'What a whirlwind!' });
      await results.waitFor({ state: 'visible', timeout: 30_000 });
      const layout = await page.evaluate(() => {
        const title = document.getElementById('results-title').getBoundingClientRect();
        const replay = document.getElementById('play-again').getBoundingClientRect();
        const details = document.getElementById('result-details');
        return {
          titleVisible: title.top >= 0 && title.bottom < innerHeight,
          replayVisible: replay.top >= 0 && replay.bottom <= innerHeight,
          detailsStartAtTop: details.scrollTop === 0,
          detailsScroll: details.scrollHeight > details.clientHeight,
        };
      });
      assert.deepEqual(layout, {
        titleVisible: true, replayVisible: true, detailsStartAtTop: true, detailsScroll: true,
      });
      await results.getByText('Next world: 🐄 Animal Farm').waitFor({ state: 'visible' });
      await results.getByRole('button', { name: 'Back to start' }).tap();
      await results.getByRole('button', { name: 'Play again' }).tap();
      await page.waitForFunction(() => !window.__app.resultsOpen && window.__app.G.tick > 3);
      assert.equal(await page.locator('#pickup-hint').isVisible(), false);

      assert.deepEqual(await page.evaluate(() => window.hostActions), ['privacy', 'pause', 'restart']);
      assert.deepEqual(requests, [localURL]);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
