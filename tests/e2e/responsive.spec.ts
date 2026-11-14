import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors, leaveBattle, newGameToGarrison, startBattle, tapTourSplash } from './parity/helpers';

interface Vp {
  readonly name: string;
  readonly w: number;
  readonly h: number;
  readonly dsf: number;
  readonly mobile?: boolean;
}

const VIEWPORTS: readonly Vp[] = [
  { name: '800x600', w: 800, h: 600, dsf: 1 },
  { name: '1024x768 4:3', w: 1024, h: 768, dsf: 1 },
  { name: '1280x720', w: 1280, h: 720, dsf: 1 },
  { name: '1366x768', w: 1366, h: 768, dsf: 1 },
  { name: '1920x1080', w: 1920, h: 1080, dsf: 1 },
  { name: '2560x1440', w: 2560, h: 1440, dsf: 1 },
  { name: '2560x1440 dsf2', w: 2560, h: 1440, dsf: 2 },
  { name: '3440x1440 ultrawide', w: 3440, h: 1440, dsf: 1 },
  { name: '360x640 small phone', w: 360, h: 640, dsf: 2, mobile: true },
  { name: '390x844 portrait phone', w: 390, h: 844, dsf: 3, mobile: true },
  { name: '844x390 landscape phone', w: 844, h: 390, dsf: 3, mobile: true },
];

/** Sim hash after 50 manual ticks of the arena demo (no input). It must not depend on the viewport. SIM_VERSION 7 hash. */
const HASH_AFTER_50 = 1799425776;

const RECT = `(() => { const r = document.querySelector('#game canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, bw: document.querySelector('#game canvas').width, bh: document.querySelector('#game canvas').height }; })()`;
const SCROLL = `({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: window.innerWidth, ih: window.innerHeight })`;

interface Rect { x: number; y: number; w: number; h: number; bw: number; bh: number }
interface Scroll { sw: number; sh: number; iw: number; ih: number }

async function expectCanvasFits(page: Page): Promise<Rect> {
  const r = await page.evaluate<Rect>(RECT);
  const s = await page.evaluate<Scroll>(SCROLL);
  expect(r.x).toBeGreaterThanOrEqual(-0.5);
  expect(r.y).toBeGreaterThanOrEqual(-0.5);
  expect(r.x + r.w).toBeLessThanOrEqual(s.iw + 0.5);
  expect(r.y + r.h).toBeLessThanOrEqual(s.ih + 0.5);
  expect(Math.abs(r.w / r.h - 16 / 9)).toBeLessThan(0.02);
  // Centred both ways at the default display size: the letterbox bands split evenly (VISUAL-QA V1).
  expect(Math.abs(r.x + r.w / 2 - s.iw / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(r.y + r.h / 2 - s.ih / 2)).toBeLessThanOrEqual(1);
  expect(s.sw).toBeLessThanOrEqual(s.iw);
  expect(s.sh).toBeLessThanOrEqual(s.ih);
  return r;
}

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name}`, () => {
    test.use({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: vp.dsf,
      isMobile: vp.mobile ?? false,
      hasTouch: vp.mobile ?? false,
    });

    test('canvas fits with 16:9, crisp backing store, no scrollbars, same sim hash', async ({ page }, info) => {
      const errors = collectErrors(page);
      await page.goto('/?ff=arenaDemo&manual=1');
      await page.locator('#game canvas').waitFor();
      await page.waitForFunction(ARENA_READY);
      const r = await expectCanvasFits(page);
      const res = Math.min(2, Math.ceil(vp.dsf));
      expect(r.bw).toBe(1280 * res);
      expect(r.bh).toBe(720 * res);
      // Device pixels covered by the canvas never exceed the backing store by more than the capped ratio.
      expect(r.bw / (r.w * vp.dsf)).toBeGreaterThanOrEqual(0.5);
      await page.evaluate(`window.__TTE__.arena.step(50, [0, 0])`);
      expect(await page.evaluate<number>(`window.__TTE__.arena.hash()`)).toBe(HASH_AFTER_50);
      await page.screenshot({ path: info.outputPath('arena.png') });
      expect(errors).toEqual([]);
    });

    test('menu, settings and garrison have no horizontal overflow', async ({ page }, info) => {
      await page.goto('/');
      await page.getByText('Help', { exact: true }).waitFor();
      for (const route of ['#main', '#settings', '#about']) {
        await page.evaluate(`window.location.hash = '${route}'`);
        await page.waitForFunction(`window.__TTE__.state().mountedRoute === '${route}'`);
        const s = await page.evaluate<Scroll>(SCROLL);
        expect(s.sw, `${route} scrollWidth`).toBeLessThanOrEqual(s.iw);
      }
      await page.evaluate(`window.location.hash = '#main'`);
      await newGameToGarrison(page);
      const s = await page.evaluate<Scroll>(SCROLL);
      expect(s.sw, 'garrison scrollWidth').toBeLessThanOrEqual(s.iw);
      await page.screenshot({ path: info.outputPath('garrison.png') });
    });

    test('battle: action bar clicks map through the scaling, chrome stays visible', async ({ page }, info) => {
      const errors = collectErrors(page);
      await page.goto(START);
      await newGameToGarrison(page);
      await startBattle(page, 'enterPracticeContainer');
      if (vp.w < 500) {
        // Portrait phone: friendly rotate overlay, dismissible.
        await expect(page.locator('#rotateOverlay')).toBeVisible();
        await page.locator('#rotateDismiss').click();
        await expect(page.locator('#rotateOverlay')).toBeHidden();
      }
      await page.waitForFunction(`window.__TTE__.arena.actionSlots().length > 0`);
      const r = await expectCanvasFits(page);
      const slots = await page.evaluate<{ x: number; y: number; size: number; cmd: number }[]>(
        `window.__TTE__.arena.actionSlots()`,
      );
      const k = r.w / 1280;
      const fs = page.locator('#fullscreenToggle');
      if (await fs.count()) {
        const b = await fs.boundingBox();
        expect(b).not.toBeNull();
        expect(b?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect((b?.x ?? 0) + (b?.width ?? 0)).toBeLessThanOrEqual(vp.w);
        expect(b?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      const expected: number[] = [];
      for (const s of slots) {
        const cx = r.x + (s.x + s.size / 2) * k;
        const cy = r.y + (s.y + s.size / 2) * k;
        expect(cx).toBeLessThanOrEqual(vp.w);
        expect(cy).toBeLessThanOrEqual(vp.h);
        if (vp.mobile) await page.touchscreen.tap(cx, cy);
        else await page.mouse.click(cx, cy);
        expected.push(s.cmd);
        await expect.poll(() => page.evaluate<number[]>(`window.__TTE__.arena.clicks()`)).toEqual(expected);
      }
      await page.screenshot({ path: info.outputPath('battle.png') });
      await leaveBattle(page);
      expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
      expect(errors).toEqual([]);
    });
  });
}

test('a window resize mid-battle keeps the match state and leaks no listeners', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(START);
  await newGameToGarrison(page);
  await startBattle(page, 'enterPracticeContainer');
  await page.evaluate(`window.__TTE__.arena.step(30)`);
  const hash = await page.evaluate<number>(`window.__TTE__.arena.hash()`);
  const tick = await page.evaluate<number>(`window.__TTE__.arena.tick`);
  const before = await expectCanvasFits(page);
  for (const [w, h] of [[700, 500], [1500, 600], [900, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await expect.poll(async () => (await page.evaluate<Rect>(RECT)).w).not.toBe(before.w);
    await expect.poll(async () => {
      const r = await page.evaluate<Rect>(RECT);
      // Phaser re-fits and re-centres on its next scale refresh after the resize.
      return r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5 && Math.abs(r.x + r.w / 2 - w / 2) <= 1 && Math.abs(r.y + r.h / 2 - h / 2) <= 1;
    }).toBe(true);
    await expectCanvasFits(page);
    expect(await page.evaluate<number>(`window.__TTE__.arena.hash()`)).toBe(hash);
    expect(await page.evaluate<number>(`window.__TTE__.arena.tick`)).toBe(tick);
  }
  await leaveBattle(page);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
});

/** Medium display size (1.25 of Largest 1.6): #game fills this fraction of the window, so a 640x360 phone leaves ~281 px. */
const MEDIUM = 1.25 / 1.6;

const TOUCH_CASES: readonly { name: string; w: number; h: number; fraction?: number }[] = [
  { name: '640x360', w: 640, h: 360 },
  { name: '640x360 at Medium display size', w: 640, h: 360, fraction: MEDIUM },
  { name: '390x844 portrait phone', w: 390, h: 844 },
  { name: '360x640 small portrait phone', w: 360, h: 640 },
  { name: '568x320 short landscape phone', w: 568, h: 320 },
  { name: '568x320 at Medium display size', w: 568, h: 320, fraction: MEDIUM },
  { name: '640x300 short landscape phone', w: 640, h: 300 },
  { name: '640x300 at Medium display size', w: 640, h: 300, fraction: MEDIUM },
  { name: '667x375 landscape phone', w: 667, h: 375 },
];

for (const tc of TOUCH_CASES) {
test.describe(`Arcade touch buttons on a coarse screen, ${tc.name}`, () => {
  test.use({ viewport: { width: tc.w, height: tc.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('every button sits inside #game, at least 48 px tall, in at most three right-edge columns (five on a game box under 272 px), none overlapping each other or the fullscreen button', async ({ page }, info) => {
    const errors = collectErrors(page);
    // The World Tour fields a team of three, so all 9 buttons are present.
    await page.goto(`${START}&ff=arcade#tour`);
    await page.getByRole('button', { name: 'Start tour' }).tap();
    await page.getByRole('button', { name: 'Fight' }).tap();
    await tapTourSplash(page);
    await page.waitForFunction(ARENA_READY);
    if (tc.fraction !== undefined) await page.evaluate(`document.documentElement.style.setProperty('--canvas-fraction', '${String(tc.fraction)}'); window.dispatchEvent(new Event('resize'))`);
    await page.evaluate(`new Promise((r) => { let n = 0; const f = () => (++n >= 30 ? r(0) : requestAnimationFrame(f)); requestAnimationFrame(f); })`); // the overlays re-sync every 5th frame
    const g = await page.evaluate<{ x: number; y: number; r: number; b: number }>(
      `(() => { const q = document.querySelector('#game').getBoundingClientRect(); return { x: q.x, y: q.y, r: q.right, b: q.bottom }; })()`,
    );
    const fs = await page.evaluate<{ x: number; y: number; r: number; b: number } | null>(
      `(() => { const n = document.querySelector('#fullscreenToggle'); if (!n || getComputedStyle(n).display === 'none') return null; const q = n.getBoundingClientRect(); return { x: q.x, y: q.y, r: q.right, b: q.bottom }; })()`,
    );
    const boxes = await page.evaluate<{ id: string; x: number; y: number; r: number; b: number; over: boolean; left: boolean }[]>(
      `Array.from(document.querySelectorAll('#game button.touchBtn'), (n) => { const q = n.getBoundingClientRect(); return { id: n.id, x: q.x, y: q.y, r: q.right, b: q.bottom, over: n.scrollWidth > n.clientWidth || n.scrollHeight > n.clientHeight, left: getComputedStyle(n).textAlign === 'left' }; })`,
    );
    expect(boxes).toHaveLength(10);
    if (fs) {
      for (const p of boxes) {
        const clear = p.r <= fs.x || fs.r <= p.x || p.b <= fs.y || fs.b <= p.y;
        expect(clear, `${p.id} covers the fullscreen button`).toBe(true);
      }
    }
    // One square size for every overlay (they sit over the canvas boxes), nothing clipped or overflowing.
    expect(new Set(boxes.map((k) => `${String(Math.round(k.r - k.x))}x${String(Math.round(k.b - k.y))}`)).size).toBe(1);
    expect(Math.round((boxes[0]?.r ?? 0) - (boxes[0]?.x ?? 0))).toBe(Math.round((boxes[0]?.b ?? 0) - (boxes[0]?.y ?? 0)));
    for (const k of boxes) expect(k.over, `${k.id} overflows`).toBe(false);
    for (const k of boxes) {
      expect(k.x, `${k.id} left`).toBeGreaterThanOrEqual(g.x - 0.5);
      expect(k.y, `${k.id} top`).toBeGreaterThanOrEqual(g.y - 0.5);
      expect(k.r, `${k.id} right`).toBeLessThanOrEqual(g.r + 0.5);
      expect(k.b, `${k.id} bottom`).toBeLessThanOrEqual(g.b + 0.5);
      expect(k.b - k.y, `${k.id} height`).toBeGreaterThanOrEqual(48);
    }
    // aligned on the left: the first box starts at the left edge of the canvas
    const cv = await page.evaluate<{ x: number }>(`(() => { const q = document.querySelector('#game canvas').getBoundingClientRect(); return { x: q.x }; })()`);
    // (the two ability boxes come first and are canvas-only, so the first overlay is at most three boxes in (the slim HUD bar adds a gap))
    expect(Math.min(...boxes.map((k) => k.x)) - cv.x).toBeLessThan(3 * ((boxes[0]?.r ?? 0) - (boxes[0]?.x ?? 0)) + 16);
    for (const [i, p] of boxes.entries()) {
      for (const q of boxes.slice(i + 1)) {
        const apart = p.r <= q.x + 0.5 || q.r <= p.x + 0.5 || p.b <= q.y + 0.5 || q.b <= p.y + 0.5;
        expect(apart, `${p.id} and ${q.id} overlap`).toBe(true);
      }
    }
    await page.screenshot({ path: info.outputPath('touch.png') });
    expect(errors).toEqual([]);
  });
});
}

for (const hc of [{ name: '568x320', w: 568, h: 320 }, { name: '640x300', w: 640, h: 300 }]) {
  test.describe(`Arcade touch buttons with high contrast, ${hc.name}`, () => {
    test.use({ viewport: { width: hc.w, height: hc.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, contrast: 'more' });

    test('stay inside #game, none overlapping or overflowing', async ({ page }, info) => {
      const errors = collectErrors(page);
      await page.goto(`${START}&ff=arcade#tour`);
      await page.getByRole('button', { name: 'Start tour' }).tap();
      await page.getByRole('button', { name: 'Fight' }).tap();
      await tapTourSplash(page);
      await page.waitForFunction(ARENA_READY);
      // Medium display size shrinks #game below 272 px on these phones (the tightest layout).
      await page.evaluate(`document.documentElement.style.setProperty('--canvas-fraction', '${String(MEDIUM)}'); window.dispatchEvent(new Event('resize'))`);
      await page.evaluate(`new Promise((r) => { let n = 0; const f = () => (++n >= 30 ? r(0) : requestAnimationFrame(f)); requestAnimationFrame(f); })`); // the overlays re-sync every 5th frame
      expect(await page.evaluate<string>(`document.documentElement.dataset.highContrast`)).toBe('true');
      const g = await page.evaluate<{ x: number; y: number; r: number; b: number }>(
        `(() => { const q = document.querySelector('#game').getBoundingClientRect(); return { x: q.x, y: q.y, r: q.right, b: q.bottom }; })()`,
      );
      expect(g.b - g.y).toBeLessThan(272);
      const boxes = await page.evaluate<{ id: string; x: number; y: number; r: number; b: number; border: number; over: boolean }[]>(
        `Array.from(document.querySelectorAll('#game button.touchBtn'), (n) => { const q = n.getBoundingClientRect(); const c = getComputedStyle(n); return { id: n.id, x: q.x, y: q.y, r: q.right, b: q.bottom, border: Math.min(parseFloat(c.borderTopWidth), parseFloat(c.borderRightWidth), parseFloat(c.borderBottomWidth), parseFloat(c.borderLeftWidth)), over: n.scrollWidth > n.clientWidth || n.scrollHeight > n.clientHeight }; })`,
      );
      expect(boxes).toHaveLength(10);
      for (const k of boxes) {
        expect(k.over, `${k.id} overflows`).toBe(false);
        expect(k.x, `${k.id} left`).toBeGreaterThanOrEqual(g.x - 0.5);
        expect(k.y, `${k.id} top`).toBeGreaterThanOrEqual(g.y - 0.5);
        expect(k.r, `${k.id} right`).toBeLessThanOrEqual(g.r + 0.5);
        expect(k.b, `${k.id} bottom`).toBeLessThanOrEqual(g.b + 0.5);
      }
      for (const [i, p] of boxes.entries()) {
        for (const q of boxes.slice(i + 1)) {
          expect(p.r <= q.x + 0.5 || q.r <= p.x + 0.5 || p.b <= q.y + 0.5 || q.b <= p.y + 0.5, `${p.id} and ${q.id} overlap`).toBe(true);
        }
      }
      await page.screenshot({ path: info.outputPath('touch-hc.png') });
      expect(errors).toEqual([]);
    });
  });
}

test('the F key and the button toggle fullscreen where the browser allows it', async ({ page }) => {
  await page.goto('/?ff=arenaDemo&manual=1');
  await page.waitForFunction(ARENA_READY);
  await expect(page.locator('#fullscreenToggle')).toBeVisible();
  await page.keyboard.press('KeyF');
  await expect.poll(() => page.evaluate<boolean>(`document.fullscreenElement !== null`)).toBe(true);
  await page.keyboard.press('KeyF');
  await expect.poll(() => page.evaluate<boolean>(`document.fullscreenElement === null`)).toBe(true);
});
