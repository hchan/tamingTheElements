import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors, tapTourSplash } from './parity/helpers';

// Portrait phone fight layout (html[data-portrait-play]): the canvas is pinned under a 52 px top strip that holds Pause, fullscreen and
// the Tour chip. Shots go to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];
const ATTR = `document.documentElement.hasAttribute('data-portrait-play')`;
const STRIP = 52;

async function enterFight(page: Page): Promise<void> {
  // Keep the first-run card up for the layout reads (see touch-fight-layout.spec.ts).
  await page.addInitScript(`(() => {
    const real = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...a) => real(fn, ms === 2500 ? 600000 : ms, ...a);
  })()`);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: /^Fight/ }).tap();
  await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
  await page.locator('#firstRunHint:not(.firstRunWait)').waitFor({ state: 'attached', timeout: 90_000 });
}

interface Box { x: number; y: number; w: number; h: number }
const box = (page: Page, sel: string): Promise<Box> =>
  page.evaluate<Box>(`(() => {
    const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function shot(page: Page, name: string): Promise<void> {
  if (shotDir) await page.screenshot({ path: `${shotDir}/${name}.png` });
}

for (const [w, h] of [[390, 844], [360, 640]] as const) {
  test.describe(`portrait play ${String(w)}x${String(h)}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    test('the canvas is pinned under the top strip; Pause and fullscreen sit in it; the card and stick are clear', async ({ page }) => {
      const errors = collectErrors(page);
      await enterFight(page);
      expect(await page.evaluate<boolean>(ATTR), 'no flag while the rotate overlay is up').toBe(false);
      await shot(page, `${String(w)}-before-dismiss`);
      await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
      await page.waitForFunction(ATTR);
      await expect.poll(async () => (await box(page, '#game canvas')).y).toBeCloseTo(STRIP, 0);
      await shot(page, `${String(w)}-after`);
      const canvas = await box(page, '#game canvas');
      expect(Math.abs(canvas.y - STRIP)).toBeLessThanOrEqual(1);
      const pause = await box(page, '#pauseButton');
      expect(pause.y + pause.h).toBeLessThanOrEqual(STRIP + 1);
      expect(pause.w).toBeGreaterThanOrEqual(44);
      expect(pause.h).toBeGreaterThanOrEqual(44);
      expect(overlap(pause, canvas)).toBe(false);
      const fs = page.locator('#fullscreenToggle');
      if (await fs.count()) {
        const f = await box(page, '#fullscreenToggle');
        expect(f.y + f.h).toBeLessThanOrEqual(STRIP + 1);
        expect(f.w).toBeGreaterThanOrEqual(44);
        expect(f.h).toBeGreaterThanOrEqual(44);
        expect(overlap(f, pause)).toBe(false);
        expect(overlap(f, canvas)).toBe(false);
      }
      const bar = await box(page, '#arcadeDash');
      const card = await box(page, '#firstRunHint');
      expect(card.y).toBeGreaterThanOrEqual(canvas.y + canvas.h + 44 - 1);
      for (const id of ['#touchStick', '#touchStrike1', '#touchStrike2']) expect(overlap(card, await box(page, id)), id).toBe(false);
      expect(bar.y).toBeLessThan(canvas.y + canvas.h);
      // P4: the card is one line, above the touch buttons (z 5) and clear of the strike buttons.
      await expect(page.locator('#firstRunHint p.firstRunOne')).toBeVisible();
      await expect(page.locator('#firstRunHint p:visible')).toHaveCount(1);
      expect(await page.evaluate<string>(`getComputedStyle(document.querySelector('#firstRunHint')).zIndex`)).toBe('6');
      await shot(page, `${String(w)}-card`);
      await page.getByRole('button', { name: 'Got it' }).tap();
      expect(errors).toEqual([]);
    });

    test('the stick still steers after the canvas moved', async ({ page }) => {
      await enterFight(page);
      await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
      await page.waitForFunction(ATTR);
      await page.getByRole('button', { name: 'Got it' }).tap();
      await page.evaluate(`(() => { window.__keys = []; window.addEventListener('keydown', (e) => window.__keys.push(e.code)); })()`);
      const s = await box(page, '#touchStick');
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - s.w / 2 + 4, y: cy, id: 1 }] });
      await expect.poll(() => page.evaluate<number>(`window.__keys.length`)).toBeGreaterThan(0);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    });

    test('rotating to landscape drops the flag, and teardown leaves no flag or listeners', async ({ page }) => {
      await enterFight(page);
      await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
      await page.waitForFunction(ATTR);
      await page.setViewportSize({ width: h, height: w });
      await page.waitForFunction(`!(${ATTR})`);
      await page.setViewportSize({ width: w, height: h });
      await page.waitForFunction(ATTR);
      await page.evaluate(`window.location.hash = '#main'`);
      await page.evaluate(`window.__TTE__.settled()`);
      await expect(page.locator('#game canvas')).toHaveCount(0);
      expect(await page.evaluate<boolean>(ATTR)).toBe(false);
      expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
    });
  });
}

test.describe('landscape phone control', () => {
  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('never sets the flag', async ({ page }) => {
    await enterFight(page);
    expect(await page.evaluate<boolean>(ATTR)).toBe(false);
    const canvas = await box(page, '#game canvas');
    expect(canvas.y).toBeLessThan(STRIP);
  });
});

test.describe('portrait play, World Tour', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('the Tour chip moves into the top strip', async ({ page }) => {
    await page.goto(`${START}&ff=arcade#tour`);
    await page.getByRole('button', { name: 'Start tour' }).tap();
    await page.getByRole('button', { name: 'Fight' }).tap();
    await tapTourSplash(page);
    await page.waitForFunction(ARENA_READY);
    await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
    await page.waitForFunction(ATTR);
    const chip = await box(page, '#tourHudStage');
    expect(chip.y + chip.h).toBeLessThanOrEqual(STRIP + 1);
    await shot(page, 'tour-after');
  });
});

for (const [w, h] of [[390, 844], [360, 640]] as const) {
  test.describe(`portrait play one-row bar ${String(w)}x${String(h)}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    test('the bar is one row; buttons are 24+ wide, 48+ high and reach 44 px below the canvas; a skirt is hittable', async ({ page }) => {
      await enterFight(page);
      await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
      await page.waitForFunction(ATTR);
      await page.getByRole('button', { name: 'Got it' }).tap();
      await page.waitForFunction(`document.querySelectorAll('button.touchBtn.touchSkirt').length > 0`);
      const canvas = await box(page, '#game canvas');
      const boxes = await page.evaluate<Box[]>(`[...document.querySelectorAll('button.touchBtn.touchSkirt')].filter((e) => e.style.visibility === 'visible').map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })`);
      expect(boxes.length).toBeGreaterThanOrEqual(5);
      const top = boxes[0]?.y ?? 0;
      for (const b of boxes) {
        expect(Math.abs(b.y - top)).toBeLessThanOrEqual(1);
        expect(b.w).toBeGreaterThanOrEqual(24);
        expect(b.h).toBeGreaterThanOrEqual(48);
        expect(b.y + b.h).toBeLessThanOrEqual(canvas.y + canvas.h + 45);
        expect(b.y + b.h).toBeGreaterThanOrEqual(canvas.y + canvas.h + 43);
      }
      await shot(page, `${String(w)}-onerow`);
      const dash = await box(page, '#arcadeDash');
      const hit = await page.evaluate<string>(`(() => { const e = document.elementFromPoint(${String(dash.x + dash.w / 2)}, ${String(canvas.y + canvas.h + 20)}); return e ? e.id : ''; })()`);
      expect(hit).toBe('arcadeDash');
    });
  });
}
