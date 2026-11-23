import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

const url = new URL('../index.html', import.meta.url).href;

test('web pause, interrupted drags, and returning to the start screen', { timeout: 120_000 }, async () => {
  const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({
      viewport: { width: 667, height: 375 }, deviceScaleFactor: 0.5, offline: true, reducedMotion: 'reduce',
    });
    await page.addInitScript(() => {
      let now = 0;
      let id = 0;
      const frames = new Map();
      Object.defineProperty(performance, 'now', { value: () => now });
      window.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
      window.cancelAnimationFrame = frame => frames.delete(frame);
      window.advanceFrame = milliseconds => {
        now += milliseconds;
        const pending = [...frames.values()];
        frames.clear();
        for (const callback of pending) callback(now);
      };
    });
    await page.goto(url);
    const home = page.getByRole('heading', { name: 'Twisty’s Tornado' });
    const quick = page.getByRole('button', { name: /^Quick:/ });
    const blue = page.getByRole('button', { name: 'Start with a blue tornado' });
    const paused = page.getByRole('dialog', { name: 'Game paused' });
    const showHome = async action => {
      await Promise.all([page.waitForEvent('domcontentloaded'), action()]);
      await home.waitFor();
      assert.equal(await quick.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: 'Turn sound on' }).isVisible(), true);
    };
    await quick.click();
    assert.equal(await page.locator('#timer-summary').textContent(), 'Up to 2:15 on the four level clocks');
    await page.getByRole('button', { name: 'Turn sound off' }).click();
    await blue.click();

    const slow = await page.evaluate(() => {
      for (let i = 0; i < 8; i++) window.advanceFrame(125);
      return { level: window.__app.G.levelT, ticks: window.__app.G.tick };
    });
    assert.equal(slow.level, 1, 'the countdown follows a second of foreground time at eight FPS');
    assert.ok(slow.ticks < 60, 'the fixture exercises the capped physics loop');

    const input = await page.evaluate(() => {
      const canvas = document.getElementById('c');
      const game = window.__app.G;
      const mouse = (target, type, buttons) => target.dispatchEvent(new MouseEvent(type, {
        clientX: 500, clientY: 225, buttons, button: 0, bubbles: true,
      }));
      mouse(canvas, 'mousedown', 1);
      const mouseStarts = game.finger.down;
      window.dispatchEvent(new Event('blur'));
      mouse(window, 'mousemove', 0);
      const noStuckMouse = !game.finger.down;
      const first = new Touch({ identifier: 1, target: canvas, clientX: 500, clientY: 225 });
      const second = new Touch({ identifier: 2, target: canvas, clientX: 300, clientY: 245 });
      const touch = (type, touches, changedTouches) => canvas.dispatchEvent(new TouchEvent(type, {
        touches, changedTouches, bubbles: true, cancelable: true,
      }));
      touch('touchstart', [first], [first]);
      const touchStarts = game.finger.down;
      touch('touchstart', [first, second], [second]);
      touch('touchend', [second], [first]);
      touch('touchmove', [second], [second]);
      return { mouseStarts, noStuckMouse, touchStarts, noSecondFingerTakeover: !game.finger.down };
    });
    assert.deepEqual(input, { mouseStarts: true, noStuckMouse: true, touchStarts: true, noSecondFingerTakeover: true });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.evaluate(() => window.advanceFrame(34000));
    const overlaps = await page.evaluate(() => {
      const hud = document.getElementById('run-hud').getBoundingClientRect();
      const countdown = document.getElementById('countdown').getBoundingClientRect();
      return !countdown.width || (countdown.left < hud.right && countdown.right > hud.left &&
        countdown.top < hud.bottom && countdown.bottom > hud.top);
    });
    assert.equal(overlaps, false, 'the portrait countdown is visible and clear of the stats');

    await page.keyboard.press('Escape');
    await paused.waitFor();
    const clock = () => page.evaluate(() => [window.__app.G.levelT, window.__app.run.seconds.tornado]);
    const before = await clock();
    await page.evaluate(() => window.advanceFrame(2000));
    assert.deepEqual(await clock(), before);
    await paused.getByRole('button', { name: 'Resume' }).click();
    await page.evaluate(() => window.advanceFrame(125));
    assert.equal((await clock())[0] - before[0], 0.125);
    await page.getByRole('button', { name: 'Pause game' }).click();
    await showHome(() => paused.getByRole('button', { name: 'End this run' }).click());

    await blue.click();
    await page.evaluate(() => window.__jumpStage('solar'));
    await page.getByRole('button', { name: 'Show space overview' }).click();
    assert.ok(await page.evaluate(() => {
      const note = document.getElementById('map-note').getBoundingClientRect();
      const pause = document.getElementById('web-pause').getBoundingClientRect();
      const mute = document.getElementById('mute').getBoundingClientRect();
      return note.height > 0 && note.bottom < Math.min(pause.top, mute.top);
    }), 'the portrait overview caption clears both corner controls');
    await page.getByRole('button', { name: 'Return to game' }).click();
    const best = await page.evaluate(() => {
      window.__finishStage();
      const unattended = window.__app.runLevels.solar.ranked;
      window.__jumpStage('galaxy');
      const canvas = document.getElementById('c');
      canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, clientX: 520, clientY: 212, bubbles: true }));
      window.advanceFrame(100);
      canvas.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      window.__finishStage();
      const records = JSON.parse(localStorage.getItem('twisty-best-v1') || '{}').quick;
      return { unattended, solar: records?.solar, galaxy: records?.galaxy };
    });
    assert.deepEqual(best, { unattended: false, solar: undefined, galaxy: 0.1 });

    await page.evaluate(() => {
      // Run the real finale handoff without a burst of queued software-rendered frames.
      window.__TUNING.FINALE_ZOOM_S = 0.01;
      window.__TUNING.FINALE_DARK_S = 0.01;
      window.__TUNING.FINALE_FLASH_S = 0.01;
      window.__jumpStage('universe');
      window.__finishStage();
      window.__app.G.winT -= 3;
      for (let i = 0; i < 6; i++) window.advanceFrame(50);
    });
    const results = page.getByRole('dialog', { name: 'What a whirlwind!' });
    await results.waitFor();
    assert.equal(await results.getByText('Next world: 🐄 Animal Farm').isVisible(), true);
    await showHome(() => results.getByRole('button', { name: 'Back to start' }).click());
    assert.equal(await page.evaluate(() => localStorage.getItem('twisty-loop-v1')), '1');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('twisty-best-v1')).quick.galaxy), 0.1);
  } finally {
    await browser.close();
  }
});
