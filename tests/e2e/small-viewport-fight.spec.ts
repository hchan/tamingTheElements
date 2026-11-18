import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START } from './parity/helpers';

// QA r76 gaps: (1) the fight screen on the smallest supported phone landscape (568x320): the HUD texts, the action bar buttons, Pause,
// the first-run hint card, the stick, the Strike buttons and the super name band never overlap each other and stay inside the viewport;
// (2) the left-handed setting (Settings > On-screen buttons > Side: left) mirrors the stick and the Strikes and nothing overlaps.
// Page-side code is passed as strings (no DOM lib in tsconfig.node). Headless only. Shots go to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];
const W = 568;
const H = 320;
const SUPER = 1 << 13;
const INTRO = 91;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Named extends Box {
  name: string;
}
// 0.5 px tolerance: controls may touch (subpixel layout).
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const inside = (b: Box): boolean => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= W + 0.5 && b.y + b.h <= H + 0.5;

/** The touch controls that must stay clear of each other and of the HUD (DOM ids; missing ones are skipped). */
const CONTROL_IDS = [
  '#fullscreenToggle', '#touchStick', '#touchStrike1', '#touchStrike2', '#pauseButton', '#firstRunHint',
  '#arcadeWeather', '#arcadeDash', '#arcadeGuard', '#arcadeSuper', '#arcadeTrap', '#arcadeElement', '#arcadeCleanse', '#arcadeRun',
];

async function enterFight(page: Page, side: 'right' | 'left'): Promise<void> {
  // The first-run card dismisses itself on a wall-clock 2500 ms timer: stretch only that one timer so the card is still up for the reads.
  await page.addInitScript(`(() => { const real = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...a) => real(fn, ms === 2500 ? 600000 : ms, ...a); })()`);
  if (side === 'left') {
    // The real path: Settings > On-screen buttons > Side: left (left-handed), then Save.
    await page.goto(`${START}#settings`);
    await page.getByLabel('Side: left (left-handed)').check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(`window.__TTE__.state().mountedRoute === '#main'`);
    await page.evaluate(`window.location.hash = '#arcade'`);
  } else {
    await page.goto(`${START}&ff=arcade#arcade`);
  }
  await page.getByRole('button', { name: /^Fight/ }).tap();
  await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
  await page.locator('#firstRunHint:not(.firstRunWait)').waitFor({ state: 'attached', timeout: 90_000 });
  await page.locator('#touchStrikes').waitFor();
}

async function controls(page: Page): Promise<Named[]> {
  return page.evaluate<Named[]>(`(() => {
    const out = [];
    for (const id of ${JSON.stringify(CONTROL_IDS)}) {
      const e = document.querySelector(id); if (!e) continue;
      const r = e.getBoundingClientRect(); if (!r.width) continue;
      out.push({ name: id, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    return out;
  })()`);
}

/** The top HUD band texts (names, life, super, timer), in viewport px. The probe's x is the origin point (t.ox says where in the box that is); y ignores the vertical origin, so only the band at the top (y < 64) is trusted; centred overhead labels lower down are skipped. */
async function hudTexts(page: Page): Promise<Named[]> {
  return page.evaluate<Named[]>(`(() => {
    const c = document.querySelector('#game canvas').getBoundingClientRect();
    return window.__TTE__.arena.hudTextSizes().map((t) => ({ name: 'hud:' + t.text, x: c.x + t.x - t.w * t.ox, y: c.y + t.y, w: t.w, h: t.h })).filter((t) => t.y < 64);
  })()`);
}

async function layout(page: Page): Promise<{ ctl: Named[]; hud: Named[]; toggle: Box | undefined }> {
  const ctl = await controls(page);
  const hud = await hudTexts(page);
  const toggle = await page.evaluate<Box | undefined>(`(() => { const e = document.querySelector('#fullscreenToggle'); if (!e) return undefined; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  return { ctl, hud, toggle };
}

function expectNoOverlaps(ctl: Named[], hud: Named[]): void {
  for (const c of ctl) expect(inside(c), `${c.name} ${JSON.stringify(c)} inside ${String(W)}x${String(H)}`).toBe(true);
  for (const h of hud) expect(inside(h), `${h.name} ${JSON.stringify(h)} inside the viewport`).toBe(true);
  for (let i = 0; i < ctl.length; i++) {
    for (let j = i + 1; j < ctl.length; j++) {
      const a = ctl[i] as Named;
      const b = ctl[j] as Named;
      expect(overlap(a, b), `${a.name} ${JSON.stringify(a)} vs ${b.name} ${JSON.stringify(b)}`).toBe(false);
    }
    for (const h of hud) expect(overlap(ctl[i] as Named, h), `${(ctl[i] as Named).name} ${JSON.stringify(ctl[i])} vs ${h.name} ${JSON.stringify(h)}`).toBe(false);
  }
  for (let i = 0; i < hud.length; i++) {
    for (let j = i + 1; j < hud.length; j++) {
      const a = hud[i] as Named;
      const b = hud[j] as Named;
      expect(overlap(a, b), `${a.name} ${JSON.stringify(a)} vs ${b.name} ${JSON.stringify(b)}`).toBe(false);
    }
  }
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: shotDir ? `${shotDir}/${name}` : test.info().outputPath(name) });
}

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const meets = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Casts a super and, on every tick of the cut, checks the band's name and portrait against the controls and the hint card. */
async function superBandClear(page: Page, label: string): Promise<void> {
  await page.evaluate(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(INTRO)});
    const [me, foe] = a.characters();
    a.place(me.id, 300, 360, 0);
    a.place(foe.id, 900, 360, 4);
    a.setHp(me.id, me.maxHp);
    a.setHp(foe.id, foe.maxHp);
  })()`);
  await frames(page);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setMeter(0, 1000); a.step(1, [${String(SUPER)}, 0]); })()`);
  await expect.poll(async () => (await page.evaluate<unknown>(`window.__TTE__.arena.superFx()`)) !== undefined).toBe(true);
  // The hint card and Pause in the band's logical 1280x720 space (the canvas fills the viewport).
  const dom = await page.evaluate<Rect[]>(`(() => {
    const c = document.querySelector('#game canvas').getBoundingClientRect();
    const k = 1280 / c.width;
    return ['#firstRunHint', '#pauseButton', '#touchStrikes', '#touchStick'].flatMap((id) => { const e = document.querySelector(id); if (!e) return []; const r = e.getBoundingClientRect();
      return [{ x0: (r.x - c.x) * k, y0: (r.y - c.y) * k, x1: (r.right - c.x) * k, y1: (r.bottom - c.y) * k }]; });
  })()`);
  let ticks = 0;
  let shotTaken = false;
  for (let i = 0; i < 40; i++) {
    await frames(page);
    const fx = await page.evaluate<{ zoom: number; band: { y: number; ext: number; portrait: Rect | null; name: Rect; avoid: Rect[] } } | undefined>(`window.__TTE__.arena.superFx()`);
    if (!fx) break;
    ticks++;
    const { y, ext, portrait, name, avoid } = fx.band;
    expect(y - ext, `${label} band top`).toBeGreaterThanOrEqual(0);
    expect(y + ext, `${label} band bottom`).toBeLessThanOrEqual(720);
    expect(name.x0, `${label} name left`).toBeGreaterThanOrEqual(0);
    expect(name.x1, `${label} name right`).toBeLessThanOrEqual(1280);
    expect(avoid.length, `${label} the band knows the touch controls`).toBeGreaterThan(0);
    for (const a of avoid) {
      if (portrait) expect(meets(portrait, a), `${label} portrait vs control ${JSON.stringify(a)}`).toBe(false);
      expect(meets(name, a), `${label} name ${JSON.stringify(name)} vs control ${JSON.stringify(a)}`).toBe(false);
    }
    for (const d of dom) {
      if (portrait) expect(meets(portrait, d), `${label} portrait vs DOM ${JSON.stringify(d)}`).toBe(false);
      expect(meets(name, d), `${label} name ${JSON.stringify(name)} vs DOM ${JSON.stringify(d)}`).toBe(false);
    }
    if (!shotTaken && fx.zoom >= 1.14) {
      shotTaken = true;
      await shot(page, `${label}.png`);
    }
    await page.evaluate(`window.__TTE__.arena.step(1)`);
  }
  expect(ticks, `${label} cut shown`).toBeGreaterThan(0);
}

function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test.describe(`phone landscape ${String(W)}x${String(H)}`, () => {
  test.use({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('HUD, action bar, Pause, hint card, stick and Strikes do not overlap and stay inside the viewport', async ({ page }) => {
    const errors = errorsOf(page);
    await enterFight(page, 'right');
    await page.evaluate(`window.__TTE__.arena.step(10)`);
    await frames(page);
    await shot(page, 'small-568-hint.png');
    const { ctl, hud } = await layout(page);
    expect(ctl.map((c) => c.name), 'every control is present').toEqual(expect.arrayContaining(['#fullscreenToggle', '#touchStick', '#touchStrike1', '#touchStrike2', '#pauseButton', '#firstRunHint', '#arcadeDash', '#arcadeSuper']));
    expect(hud.length, 'the HUD texts are drawn').toBeGreaterThan(4);
    expectNoOverlaps(ctl, hud);
    // The action bar buttons are one row at the bottom: never above the Strikes or the Pause.
    const bar = ctl.filter((c) => c.name.startsWith('#arcade'));
    const strikeBottom = Math.max(...ctl.filter((c) => c.name.startsWith('#touchStrike')).map((c) => c.y + c.h));
    for (const b of bar) expect(b.y, b.name).toBeGreaterThanOrEqual(strikeBottom - 0.5);
    // Without the hint card (Got it), the live HUD and controls still hold.
    await page.getByRole('button', { name: 'Got it' }).tap();
    await page.evaluate(`window.__TTE__.arena.step(120)`);
    await frames(page);
    await shot(page, 'small-568-live.png');
    const live = await layout(page);
    expectNoOverlaps(live.ctl, live.hud);
    expect(errors).toEqual([]);
  });

  test('the super name band keeps its portrait and title off the controls and the hint card', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = errorsOf(page);
    await enterFight(page, 'right');
    await superBandClear(page, 'small-568-super');
    expect(errors).toEqual([]);
  });

  // Found by this spec: the fullscreen toggle sat over the foe's life readout and portrait at 568x320; it now sits below Pause.
  test('the fullscreen toggle clears the HUD texts', async ({ page }) => {
    await enterFight(page, 'right');
    await page.evaluate(`window.__TTE__.arena.step(10)`);
    const { hud, toggle } = await layout(page);
    expect(toggle, 'the toggle shows on a phone this small').toBeDefined();
    for (const h of hud) expect(overlap(toggle as Box, h), `toggle ${JSON.stringify(toggle)} vs ${h.name} ${JSON.stringify(h)}`).toBe(false);
  });

  test.describe('left-handed', () => {
    test('the stick and the Strikes mirror to the other side, and nothing overlaps', async ({ page }) => {
      const errors = errorsOf(page);
      await enterFight(page, 'left');
      expect(await page.evaluate(`document.documentElement.getAttribute('data-touch-side')`)).toBe('left');
      await page.evaluate(`window.__TTE__.arena.step(10)`);
      await frames(page);
      await shot(page, 'small-568-left-hint.png');
      const { ctl, hud } = await layout(page);
      const at = (n: string): Named => ctl.find((c) => c.name === n) as Named;
      // Mirrored: the stick on the right half, both Strikes on the left half (right-handed play is the other way round).
      expect(at('#touchStick').x, 'stick on the right').toBeGreaterThan(W / 2);
      expect(at('#touchStrike1').x + at('#touchStrike1').w, 'Strike 1 on the left').toBeLessThan(W / 2);
      expect(at('#touchStrike2').x + at('#touchStrike2').w, 'Strike 2 on the left').toBeLessThan(W / 2);
      expect(at('#touchStick').x + at('#touchStick').w, 'stick keeps the same edge margin').toBeLessThanOrEqual(W - 6 + 0.5);
      expectNoOverlaps(ctl, hud);
      await page.getByRole('button', { name: 'Got it' }).tap();
      await page.evaluate(`window.__TTE__.arena.step(120)`);
      await frames(page);
      await shot(page, 'small-568-left-live.png');
      const live = await layout(page);
      expectNoOverlaps(live.ctl, live.hud);
      expect(errors).toEqual([]);
    });

    test('the mirrored stick still drives the fighter and the super band clears the mirrored controls', async ({ page }) => {
      test.setTimeout(120_000);
      const errors = errorsOf(page);
      await enterFight(page, 'left');
      await page.getByRole('button', { name: 'Got it' }).tap();
      await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
      // A Strike on the left holds the bar's key 1, like the right-handed one.
      await page.evaluate(`window.__codes = []; window.addEventListener('keydown', (e) => window.__codes.push(e.code));`);
      const sb = (await controls(page)).find((c) => c.name === '#touchStrike1') as Named;
      await page.touchscreen.tap(sb.x + sb.w / 2, sb.y + sb.h / 2);
      const down = await page.evaluate<string[]>(`window.__codes`);
      expect(down).toContain('Digit1');
      await superBandClear(page, 'small-568-left-super');
      expect(errors).toEqual([]);
    });
  });
});
