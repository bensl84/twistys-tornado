import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { build } from './build.mjs';

test('the packaged game plays offline and its host can pause and resume it', { timeout: 120_000 }, async () => {
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

      assert.deepEqual(await page.evaluate(() => window.hostActions), ['privacy', 'pause']);
      assert.deepEqual(requests, [localURL]);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
