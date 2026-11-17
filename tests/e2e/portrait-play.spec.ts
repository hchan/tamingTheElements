import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors, tapTourSplash } from './parity/helpers';

// Portrait phone fight layout (html[data-portrait-play]): the canvas is pinned under a 52 px top strip that holds Pause, fullscreen and
// the Tour chip. Shots go to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];
const ATTR = `document.documentElement.hasAttribute('data-portrait-play')`;
const STRIP = 52;
const HUD_BAND = 70;
const DECK = 156;
interface Tall { camZoom: number; viewHeight: number; floorScreenY: number }

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
      // The card sits on the (tall) canvas just under the HUD band and above the settled action bar, clear of the touch controls.
      const card = await box(page, '#firstRunHint');
      expect(card.y).toBeGreaterThanOrEqual(STRIP + HUD_BAND);
      for (const id of ['#touchStick', '#touchStrike1', '#touchStrike2', '#pauseButton']) expect(overlap(card, await box(page, id)), id).toBe(false);
      // The bar overlays are laid out every few frames after the flag flips, so wait for the settled one-row layout (a skirt 44 px above the
      // plate) before measuring. Its lower edge sits on the canvas bottom, its top inside the canvas, and every slot (button or strip) shares that edge.
      const canvasBottom = canvas.y + canvas.h;
      const edges = (): Promise<number[]> => page.evaluate<number[]>(`[...document.querySelectorAll('.touchSkirt')].filter((e) => getComputedStyle(e).visibility !== 'hidden').map((e) => Math.round(e.getBoundingClientRect().bottom))`);
      await expect.poll(async () => (await box(page, '#arcadeDash')).h, { message: 'one-row layout settles' }).toBeGreaterThan(70);
      const settled = await box(page, '#arcadeDash');
      expect(settled.y).toBeLessThan(canvasBottom);
      expect(Math.abs(settled.y + settled.h - canvasBottom)).toBeLessThanOrEqual(1);
      await expect.poll(async () => { const c = await box(page, '#firstRunHint'); return c.y + c.h; }, { timeout: 1500 }).toBeLessThanOrEqual(settled.y);
      const bottoms = await edges();
      expect(bottoms.length, 'every bar slot has a skirt').toBeGreaterThanOrEqual(8);
      expect(new Set(bottoms).size, `one lower edge: ${bottoms.join(',')}`).toBe(1);
      // P4: the card is one line, above the touch buttons (z 5) and clear of the strike buttons.
      await expect(page.locator('#firstRunHint p.firstRunOne')).toBeVisible();
      await expect(page.locator('#firstRunHint p:visible')).toHaveCount(1);
      expect(await page.evaluate<string>(`getComputedStyle(document.querySelector('#firstRunHint')).zIndex`)).toBe('6');
      await shot(page, `${String(w)}-card`);
      await page.getByRole('button', { name: 'Got it' }).tap();
      expect(errors).toEqual([]);
    });

    test('the canvas is tall: it fills down to the deck, the floor sits on the bar, the sim is unchanged', async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(`${START}&ff=arcade#arcade`);
      await page.getByRole('button', { name: /^Fight/ }).tap();
      await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
      await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
      await page.waitForFunction(ATTR);
      const bottom = h - DECK;
      // The deck is at least 156 px and grows when the stick starts higher (it is measured from the stick), so allow up to 12 px more.
      await expect.poll(async () => { const c = await box(page, '#game canvas'); const d = bottom - (c.y + c.h); return d >= -0.5 && d <= 12; }, { timeout: 10000 }).toBe(true);
      const canvas = await box(page, '#game canvas');
      expect(bottom - (canvas.y + canvas.h)).toBeLessThanOrEqual(12);
      expect(canvas.h).toBeGreaterThanOrEqual(h - 220);
      const back = await page.evaluate<{ bw: number; bh: number }>(`(() => { const c = document.querySelector('#game canvas'); return { bw: c.width, bh: c.height }; })()`);
      // Pixel budget: no more than the normal 2560x1440 backing store (the tall canvas trades width for height).
      expect(back.bw * back.bh).toBeLessThanOrEqual(2560 * 1440 * 1.02);
      for (const id of ['#touchStick', '#touchStrike1', '#touchStrike2']) {
        const b = await box(page, id);
        expect(b.y, id).toBeGreaterThanOrEqual(canvas.y + canvas.h + 4 - 1);
      }
      const floor = async (): Promise<Tall> => page.evaluate<Tall>(`window.__TTE__.arena.camera()`);
      const expectFramed = async (): Promise<void> => {
        await expect.poll(async () => (await floor()).camZoom, { timeout: 5000 }).toBeGreaterThanOrEqual(1.1);
        await expect.poll(async () => {
          const f = await floor();
          const c = await box(page, '#game canvas');
          const bar = await box(page, '#arcadeDash');
          // The overlay reaches 44 px up over the canvas; the drawn plate (and so the floor's lower edge) starts below that.
          return Math.abs(c.y + (f.floorScreenY * c.h) / f.viewHeight - (bar.y + 44));
        }, { timeout: 5000 }).toBeLessThanOrEqual(2);
      };
      await expectFramed();
      await page.evaluate(`window.__TTE__.arena.step(50, [0, 0])`);
      expect(await page.evaluate<number>(`window.__TTE__.arena.hash()`)).toBe(173923228);
      // Rotate mid-fight and back: the framing is re-applied.
      await page.setViewportSize({ width: h, height: w });
      await page.waitForFunction(`!(${ATTR})`);
      await expect.poll(async () => (await floor()).viewHeight).toBeCloseTo(720, 0);
      await page.setViewportSize({ width: w, height: h });
      await page.waitForFunction(ATTR);
      await expectFramed();
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

    test('the bar is one row; buttons are 24+ wide, 48+ high and reach 44 px up over the canvas; a skirt is hittable', async ({ page }) => {
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
        expect(b.y + b.h).toBeLessThanOrEqual(canvas.y + canvas.h + 1);
        expect(b.y + b.h).toBeGreaterThanOrEqual(canvas.y + canvas.h - 1);
      }
      await shot(page, `${String(w)}-onerow`);
      const dash = await box(page, '#arcadeDash');
      const hit = await page.evaluate<string>(`(() => { const e = document.elementFromPoint(${String(dash.x + dash.w / 2)}, ${String(canvas.y + canvas.h - 20)}); return e ? e.id : ''; })()`);
      expect(hit).toBe('arcadeDash');
    });
  });
}
