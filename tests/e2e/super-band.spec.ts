import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ARENA_READY, START } from './parity/helpers';

// SUPER-BAND-1: the super name band picks a row clear of every fighter's swept span and keeps its portrait and title off the
// touch controls. Casts run back to back in one page at 1280x720, 844x390 and 667x375; on every tick of each cut the live
// fighter boxes (through the cut's camera) must miss the band, and the portrait and title must miss the controls.
// Shots go to the test output dir and to $SHOT_DIR when set. Page-side code is passed as strings (no DOM lib in tsconfig.node).
const shotDir = process.env['SHOT_DIR'];
const SUPER = 1 << 13;
const INTRO = 91;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface Fx {
  zoom: number;
  nameAlpha: number;
  subAlpha: number;
  bandAlpha: number;
  band: { y: number; k: number; ext: number; cost: number; side: number; portrait: Rect | null; name: Rect; avoid: Rect[]; spans: unknown[] };
  fighters: { x0: number; x1: number; top: number; bottom: number; caster: boolean }[];
}
interface Place {
  name: string;
  me: [number, number, number];
  foe: [number, number, number];
  /** A clear slot exists, so the band must clear every fighter (cost 0). */
  clear: boolean;
}

const PLACES: Place[] = [
  { name: 'default', me: [300, 360, 0], foe: [900, 360, 4], clear: true },
  { name: 'close', me: [300, 330, 0], foe: [420, 350, 4], clear: true },
  { name: 'foe-high', me: [300, 460, 0], foe: [700, 250, 4], clear: false },
  { name: 'wall', me: [1100, 420, 4], foe: [1230, 380, 4], clear: false },
  { name: 'caster-right', me: [900, 360, 4], foe: [300, 360, 0], clear: true },
];

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const superFx = (page: Page): Promise<Fx | undefined> => page.evaluate<Fx | undefined>(`window.__TTE__.arena.superFx()`);
const meets = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

async function shot(page: Page, testInfo: TestInfo, file: string): Promise<void> {
  await page.screenshot({ path: testInfo.outputPath(file) });
  if (shotDir) await page.screenshot({ path: `${shotDir}/${file}` });
}

async function openDesktop(page: Page): Promise<void> {
  await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
}

async function openPhone(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: /^Fight/ }).tap();
  await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
  await page.locator('#touchStrikes').waitFor();
}

/** Places both fighters, fills the bar and presses the super; returns once the cut shows. */
async function cast(page: Page, p: Place, first: boolean): Promise<void> {
  await page.evaluate(`(() => {
    const a = window.__TTE__.arena;
    ${first ? `a.step(${String(INTRO)});` : ''}
    const [me, foe] = a.characters();
    a.place(me.id, ${String(p.me[0])}, ${String(p.me[1])}, ${String(p.me[2])});
    a.place(foe.id, ${String(p.foe[0])}, ${String(p.foe[1])}, ${String(p.foe[2])});
    a.setHp(me.id, me.maxHp);
    a.setHp(foe.id, foe.maxHp);
  })()`);
  // Let the views redraw at the new spots, so the cut reads the fighters where they stand (the game's own views are never a frame behind a teleport).
  await frames(page);
  await page.evaluate(`(() => {
    const a = window.__TTE__.arena;
    a.setMeter(0, 1000);
    a.step(1, [${String(SUPER)}, 0]);
  })()`);
  await expect.poll(async () => (await superFx(page)) !== undefined).toBe(true);
}

/** Steps through the whole cut, checking every tick; shots at the first tick near peak zoom. */
async function watch(page: Page, testInfo: TestInfo, p: Place, label: string, opts: { reduced?: boolean; phone?: boolean }): Promise<Fx> {
  let first: Fx | undefined;
  let shotTaken = false;
  for (let i = 0; i < 40; i++) {
    await frames(page);
    const fx = await superFx(page);
    if (!fx) break;
    first ??= fx;
    const { y, ext, cost, portrait, name, avoid } = fx.band;
    expect(y - ext, `${label} top`).toBeGreaterThanOrEqual(117);
    expect(y + ext, `${label} bottom`).toBeLessThanOrEqual(603);
    const band: Rect = { x0: -1e4, y0: y - ext, x1: 1e4, y1: y + ext };
    if (cost === 0) {
      for (const f of fx.fighters) expect(meets({ x0: f.x0, x1: f.x1, y0: f.top - 4, y1: f.bottom + 12 }, band), `${label} fighter ${JSON.stringify(f)} vs band ${String(y)}+-${String(ext)}`).toBe(false);
    } else {
      const c = fx.fighters.find((f) => f.caster);
      // blocked: the band crosses the foe, not the caster
      if (p.name === 'foe-high' && c) expect(meets({ x0: c.x0, x1: c.x1, y0: c.top - 4, y1: c.bottom + 12 }, band), `${label} caster`).toBe(false);
    }
    for (const a of avoid) {
      if (portrait) expect(meets(portrait, a), `${label} portrait vs control`).toBe(false);
      expect(meets(name, a), `${label} name ${JSON.stringify(name)} vs control ${JSON.stringify(a)}`).toBe(false);
    }
    if (opts.reduced) expect(fx.zoom).toBe(1);
    expect([0, 1], `${label} nameAlpha`).toContain(fx.nameAlpha);
    expect([0, 1], `${label} subAlpha`).toContain(fx.subAlpha);
    if (!shotTaken && (opts.reduced ? fx.nameAlpha === 1 : fx.zoom >= 1.14)) {
      shotTaken = true;
      expect(fx.nameAlpha, `${label} title at the shot`).toBe(1);
      await shot(page, testInfo, `super-band-${label}.png`);
    }
    await page.evaluate(`window.__TTE__.arena.step(1)`);
  }
  expect(first, `${label} cut shown`).toBeDefined();
  expect(shotTaken, `${label} shot`).toBe(true);
  return first as Fx;
}

async function sequence(page: Page, testInfo: TestInfo, size: string, phone: boolean): Promise<void> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await (phone ? openPhone(page) : openDesktop(page));
  let firstCast = true;
  for (const p of PLACES) {
    await cast(page, p, firstCast);
    firstCast = false;
    const fx = await watch(page, testInfo, p, `${size}-${p.name}`, { phone });
    const b = fx.band;
    console.log(`${size} ${p.name}: y ${String(b.y)} k ${String(b.k)} cost ${String(b.cost)} side ${String(b.side)} avoid ${String(b.avoid.length)}`);
    if (!phone) expect(b.avoid, 'no touch controls on desktop').toEqual([]);
    else expect(b.avoid.length).toBeGreaterThan(0);
    if (p.clear && !phone) expect(b.cost, `${size} ${p.name} clear slot`).toBe(0);
    await page.evaluate(`window.__TTE__.arena.step(120)`);
  }
  expect(errors).toEqual([]);
}

test.describe('desktop 1280x720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test('the band clears both fighters on every cast', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await sequence(page, testInfo, '1280x720', false);
  });

  test('the Air title keeps its dark rim through the cut-out', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Your race').selectOption('cyclonius');
    await page.getByLabel('AI race').selectOption('lavax');
    await page.getByRole('button', { name: /^Fight/ }).click();
    await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
    await page.evaluate(`window.__TTE__.arena.step(${String(INTRO + 20)})`);
    const done = page.locator('.firstRunDone');
    if (await done.isVisible()) await done.click();
    const stage = (): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.terrain().stage`);
    if ((await stage()) !== 4) {
      await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setWeatherCharge(0, 1000); a.step(1, [1 << 14, 0]); a.step(60); })()`);
    }
    await cast(page, { name: 'air', me: [560, 360, 0], foe: [680, 360, 4], clear: true }, false);
    let peak = false;
    let held = false;
    for (let i = 0; i < 40; i++) {
      await frames(page);
      const fx = await superFx(page);
      if (!fx) break;
      if (!peak && fx.zoom >= 1.14) {
        peak = true;
        await shot(page, testInfo, 'super-air-peak.png');
      }
      if (fx.bandAlpha < 0.4) expect(fx.nameAlpha, 'faded band hides the title').toBe(0);
      else expect(fx.nameAlpha).toBe(1);
      if (fx.bandAlpha >= 0.4 && fx.bandAlpha < 1) {
        held = true;
        expect(fx.nameAlpha).toBe(1);
        await shot(page, testInfo, 'super-air-fade.png');
      }
      await page.evaluate(`window.__TTE__.arena.step(1)`);
    }
    expect(peak, 'peak shot').toBe(true);
    expect(held, 'held last tick shot').toBe(true);
  });

  test.describe('reduced motion', () => {
    test('zoom stays 1 and the band still clears the pair', async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openDesktop(page);
      const p = PLACES[1] as Place;
      await cast(page, p, true);
      const fx = await watch(page, testInfo, p, '1280x720-reduced', { reduced: true });
      expect(fx.band.cost).toBe(0);
    });
  });
});

for (const [w, h] of [
  [844, 390],
  [667, 375],
] as const) {
  test.describe(`phone ${String(w)}x${String(h)}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    test('the band and title stay off the touch controls', async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      await sequence(page, testInfo, `${String(w)}x${String(h)}`, true);
      if (w === 667) {
        // At 667 the PHONE-2 gutter puts Strike 1/2 and Pause beside the canvas, not over it, so only the stick is an avoid rect.
        // Independent check of the DOM mapping on the stick: its own rect, scaled by the canvas width over the 1280 core units.
        await cast(page, PLACES[0] as Place, false);
        const fx = await superFx(page);
        const r = await page.evaluate<{ k: number; left: number; s: { x: number; y: number; w: number }; strikeOver: boolean }>(`(() => {
          const q = (id) => document.getElementById(id).getBoundingClientRect();
          const c = document.querySelector('#game canvas').getBoundingClientRect();
          const s = q('touchStick');
          const over = ['touchStrike1', 'touchStrike2', 'pauseButton'].some((id) => { const e = q(id); return e.left < c.right && e.right > c.left; });
          return { k: c.width / 1280, left: c.left, s: { x: s.x, y: s.y, w: s.width }, strikeOver: over };
        })()`);
        const av = fx?.band.avoid ?? [];
        expect(r.strikeOver, 'strikes and pause sit in the gutter, off the canvas').toBe(false);
        expect(av.length, 'only the stick is over the canvas').toBe(1);
        const [a1] = av;
        expect(a1).toBeTruthy();
        if (a1) {
          expect(a1.x1 - a1.x0 - 16, 'stick width in core units').toBeCloseTo(r.s.w / r.k, 0);
          expect(a1.x0 + 8, 'stick left in core units').toBeCloseTo((r.s.x - r.left) / r.k, 0);
        }
      }
    });
  });
}
