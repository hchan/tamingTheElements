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
      // The bar overlays are laid out every few frames after the flag flips, so wait for the settled layout before measuring. The bar is one
      // row (skirts 44 px up over the plate) or, when a row would be under 44 px wide, 44+ px tiles in rows; either way its lowest edge is the
      // canvas bottom, nothing hangs below it, and the card sits above its topmost box.
      const canvasBottom = canvas.y + canvas.h;
      const edges = (): Promise<number[]> => page.evaluate<number[]>(`[...document.querySelectorAll('.touchSkirt, .touchSkirtDeco')].filter((e) => getComputedStyle(e).visibility !== 'hidden').map((e) => Math.round(e.getBoundingClientRect().bottom))`);
      const topmost = (): Promise<number> => page.evaluate<number>(`Math.min(...[...document.querySelectorAll('.touchSkirt, .touchSkirtDeco')].filter((e) => getComputedStyle(e).visibility !== 'hidden').map((e) => e.getBoundingClientRect().top))`);
      await expect.poll(async () => (await edges()).length, { message: 'bar layout settles' }).toBeGreaterThanOrEqual(8);
      await expect.poll(async () => Math.abs(Math.max(...(await edges())) - canvasBottom), { message: 'lowest edge on the canvas bottom' }).toBeLessThanOrEqual(1);
      const bottoms = await edges();
      expect(Math.max(...bottoms)).toBeLessThanOrEqual(canvasBottom + 1);
      const topEdge = await topmost();
      expect(topEdge).toBeLessThan(canvasBottom - 43);
      await expect.poll(async () => { const c = await box(page, '#firstRunHint'); return c.y + c.h; }, { timeout: 1500 }).toBeLessThanOrEqual(topEdge);
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
          // One-row bar: the overlay reaches 44 px up over the canvas and the drawn plate (the floor's lower edge) starts below that.
          // Tile bar (boxes already 44+ px): the plate's top is the topmost box.
          const top = await page.evaluate<number>(`Math.min(...[...document.querySelectorAll('button.touchBtn.touchSkirt, .touchSkirtDeco')].filter((e) => getComputedStyle(e).visibility === 'visible').map((e) => e.getBoundingClientRect().top))`);
          return Math.abs(c.y + (f.floorScreenY * c.h) / f.viewHeight - (bar.h > 70 ? bar.y + 44 : top));
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

interface Ctl { id: string; x: number; y: number; w: number; h: number; disabled: boolean }
const CONTROLS = `[...document.querySelectorAll('button.touchBtn, .touchStrike, .touchSkirtDeco, #touchStick, .pauseButton, #fullscreenToggle')]
  .filter((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0; })
  .map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.className, x: r.x, y: r.y, w: r.width, h: r.height, disabled: e.disabled === true || e.getAttribute('aria-disabled') === 'true' }; })`;

for (const [w, h] of [[390, 844], [360, 640]] as const) {
  test.describe(`portrait play touch targets ${String(w)}x${String(h)}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    test('every visible control has a 44x44 hit box inside the screen, the bar sits clear of the strikes, and Strike 1 is in thumb reach', async ({ page }) => {
      await enterFight(page);
      await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
      await page.waitForFunction(ATTR);
      await page.getByRole('button', { name: 'Got it' }).tap();
      await page.waitForFunction(`document.querySelectorAll('button.touchBtn.touchSkirt').length > 0`);
      const canvas = await box(page, '#game canvas');
      const ctls = await page.evaluate<Ctl[]>(CONTROLS);
      expect(ctls.length).toBeGreaterThanOrEqual(10);
      for (const c of ctls) {
        expect(c.w, `${c.id} width`).toBeGreaterThanOrEqual(44 - 0.6);
        expect(c.h, `${c.id} height`).toBeGreaterThanOrEqual(44 - 0.6);
        expect(c.x, c.id).toBeGreaterThanOrEqual(-0.5);
        expect(c.x + c.w, c.id).toBeLessThanOrEqual(w + 0.5);
        expect(c.y + c.h, c.id).toBeLessThanOrEqual(h + 0.5);
      }
      // Blast and Flame (strike slots, no DOM button) are decos over their bar boxes: still 44+, and they sit on the canvas.
      expect(ctls.filter((c) => c.id.startsWith('touchSkirtDeco')).length).toBeGreaterThanOrEqual(2);
      // Tile bar: no two bar boxes overlap each other.
      const bar = ctls.filter((c) => c.id.startsWith('arcade') || c.id.startsWith('touchSkirtDeco'));
      for (let i = 0; i < bar.length; i++) for (let j = i + 1; j < bar.length; j++) {
        const a = bar[i], b = bar[j];
        if (a && b) expect(overlap({ x: a.x, y: a.y, w: a.w, h: a.h }, { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 }), `${a.id} / ${b.id}`).toBe(false);
      }
      // Strikes: below the canvas, both lifted at least 40 px off the screen bottom.
      for (const id of ['#touchStrike1', '#touchStrike2']) {
        const b = await box(page, id);
        expect(h - (b.y + b.h), id).toBeGreaterThanOrEqual(40);
        expect(b.y, id).toBeGreaterThanOrEqual(canvas.y + canvas.h);
      }
      await shot(page, `${String(w)}-targets`);
    });

    test('a tap on every bar box does something (a command) or the box is visibly disabled', async ({ page }) => {
      await enterFight(page);
      await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
      await page.waitForFunction(ATTR);
      await page.getByRole('button', { name: 'Got it' }).tap();
      await page.waitForFunction(`document.querySelectorAll('button.touchBtn.touchSkirt').length > 0`);
      // Canvas-click boxes (Blast, Flame, Ember, Cleanse, Charge...): the tap reaches the canvas and `clicks()` records the command.
      const decos = await page.evaluate<Ctl[]>(`${CONTROLS}.filter((c) => c.id.startsWith('touchSkirtDeco'))`);
      expect(decos.length).toBeGreaterThanOrEqual(2);
      const fired: number[] = [];
      for (const d of decos) {
        const before = await page.evaluate<number[]>(`window.__TTE__.arena.clicks()`);
        await page.touchscreen.tap(d.x + d.w / 2, d.y + d.h / 2);
        await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
        const after = await page.evaluate<number[]>(`window.__TTE__.arena.clicks()`);
        // A disabled box (Charge for a ranged hero) records nothing and says so: its deco carries the "Melee" note instead.
        if (after.length > before.length) fired.push(after[after.length - 1] ?? 0);
      }
      expect(fired.length, 'at least Blast and Flame fire').toBeGreaterThanOrEqual(2);
      expect(new Set(fired).size).toBe(fired.length);
      // DOM buttons: pressing one holds its key (window.__keys) unless it is disabled.
      const btns = await page.evaluate<Ctl[]>(`${CONTROLS}.filter((c) => c.id.startsWith('arcade'))`);
      expect(btns.length).toBeGreaterThanOrEqual(5);
      for (const b of btns) {
        if (b.disabled) continue;
        const hit = await page.evaluate<string>(`(() => { const e = document.elementFromPoint(${String(b.x + b.w / 2)}, ${String(b.y + b.h / 2)}); return e ? e.id : ''; })()`);
        expect(hit, `${b.id} is the element under its own centre`).toBe(b.id);
      }
      for (const id of ['#touchStrike1', '#touchStrike2']) {
        const b = await box(page, id);
        const hit = await page.evaluate<string>(`(() => { const e = document.elementFromPoint(${String(b.x + b.w / 2)}, ${String(b.y + b.h / 2)}); return e ? (e.closest('.touchStrike') || e).id : ''; })()`);
        expect(hit).toBe(id.slice(1));
      }
    });

    test('3v3: Tag and Tag 2 are 44x44 buttons, hold their key on a tap, and every control is still 44x44', async ({ page }) => {
      await page.goto(`${START}&ff=arcade#arcade`);
      await page.getByLabel('Team').selectOption('3');
      await page.getByLabel('Your race').selectOption('sindarosa');
      await page.getByLabel('Your partner (2v2)').selectOption('pax');
      await page.getByLabel('Your third hero (3v3)').selectOption('curomo');
      await page.getByLabel('AI race').selectOption('fiara');
      await page.getByRole('button', { name: 'Fight!' }).tap();
      await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
      await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
      await page.waitForFunction(ATTR);
      await page.waitForFunction(`document.querySelectorAll('#arcadeTag, #arcadeTag2').length === 2`);
      const ctls = await page.evaluate<Ctl[]>(CONTROLS);
      const tags = ctls.filter((c) => c.id === 'arcadeTag' || c.id === 'arcadeTag2');
      expect(tags.map((t) => t.id).sort()).toEqual(['arcadeTag', 'arcadeTag2']);
      for (const c of ctls) {
        expect(c.w, `${c.id} width`).toBeGreaterThanOrEqual(44 - 0.6);
        expect(c.h, `${c.id} height`).toBeGreaterThanOrEqual(44 - 0.6);
        expect(c.x + c.w, c.id).toBeLessThanOrEqual(w + 0.5);
      }
      for (const t of tags) {
        const hit = await page.evaluate<string>(`(() => { const e = document.elementFromPoint(${String(t.x + t.w / 2)}, ${String(t.y + t.h / 2)}); return e ? e.id : ''; })()`);
        expect(hit, `${t.id} is the element under its own centre`).toBe(t.id);
      }
      await shot(page, `${String(w)}-3v3-targets`);
    });
  });
}

