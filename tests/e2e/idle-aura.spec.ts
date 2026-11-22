import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Idle element auras (ideas/in-progress/idle-element-auras.md, IA2): every active hero carries a faint element look (fire embers
// and heat, air wisps and a rare spark, earth grit and pebbles, water motes and a sheen) that scales with its tier, stops
// moving under reduced motion, thins to a crisp few parts under high contrast, and never flashes more than three times a second.
// SHOT_DIR=<dir> saves a screenshot per element, reduced motion and high contrast (headless).

// Mirrors IdleAuraProbe in src/game/fx/idle-aura-view.ts (not imported: the e2e project has no DOM lib).
// Pixel visibility (QA r50/r51: the aura was barely visible at real game scale). The same frame is screenshotted with the aura
// shown and hidden (arena.idleAuraHide); the arena band (below the HUD, above the hotbar) must differ in enough pixels, with
// enough luminance, and more than the noise of two hidden shots.
const diffInPage = `async ([a, b, y0, y1]) => {
  const load = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const w = ia.width, h = ia.height;
  const rd = (im) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, Math.floor(h * y0), w, Math.floor(h * (y1 - y0))).data; };
  const da = rd(ia), db = rd(ib);
  let n = 0, sum = 0;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    if (d > 24) { n++; sum += d; }
  }
  return { n, sum, total: da.length / 4 };
}`;
const dataUrl = async (page: Page): Promise<string> => `data:image/png;base64,${(await page.locator('#game canvas').screenshot()).toString('base64')}`;
async function pixelDiff(page: Page, a: string, b: string): Promise<{ n: number; sum: number; total: number }> {
  return page.evaluate(`(${diffInPage})(${JSON.stringify([a, b, 0.14, 0.88])})`);
}
const hide = (page: Page, on: boolean): Promise<unknown> => page.evaluate(`window.__TTE__.arena.idleAuraHide(${String(on)})`);

interface IdleAuraProbe {
  heroes: { id: number; element: string; parts: number; front: number; dim: number; age: number }[];
  parts: number;
  front: number;
  segs: number;
  strikes: { id: number; tick: number }[];
  reduced: boolean;
  highContrast: boolean;
  cap: number;
}
const INTRO = 91;
const SHOT_DIR = process.env['SHOT_DIR'];
const RACES: readonly [string, string][] = [
  ['sindarosa', 'fire'],
  ['cyclonius', 'air'],
  ['rokcore', 'earth'],
  ['curomo', 'water'],
];

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
/** Several frames: a toggle only shows once Phaser has drawn it, and under load (parallel agents) two rAFs can pass before that. */
const settle = async (page: Page): Promise<void> => {
  for (let i = 0; i < 4; i++) await frames(page);
};
const probe = async (page: Page): Promise<IdleAuraProbe> => {
  await frames(page);
  const p = await page.evaluate<IdleAuraProbe | undefined>(`window.__TTE__.arena.idleAura()`);
  expect(p).toBeDefined();
  return p as IdleAuraProbe;
};
const step = (page: Page, n: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.step(${String(n)})`);

async function setup(page: Page, race: string): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption(race);
  await page.getByLabel('AI race').selectOption(race);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await step(page, INTRO);
  await step(page, 40);
  await frames(page);
  // The aura ramps in over 16 ticks (RAMP_TICKS) from the first frame that draws the hero, and a manual step() batch may render
  // nothing until its last frame, so the hero can still be mid-ramp (alpha ~0: parts and front parts undrawn, counts unstable).
  // Step past the ramp, tick-based, so every probe sees a fully faded-in aura.
  await step(page, 20);
  await frames(page);
  // The FIGHT! banner dims by an eased factor per drawn frame while a fighter sits under it (round-view / banner-clear.ts, 66a1708e;
  // fire and earth heroes do, air and water do not). Draw enough frames (about 25 settle it) that the shown and hidden shots see
  // the same banner; otherwise two hidden shots differ by ~40k px and the visibility check below drowns in "noise".
  for (let i = 0; i < 8; i++) await settle(page);
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.locator('#game canvas').screenshot({ path: `${SHOT_DIR}/idle-${name}.png` });
}

for (const [race, element] of RACES) {
  test(`${race}: a ${element} aura rides each hero and ages with the match`, async ({ page }) => {
    const errors = collectErrors(page);
    await setup(page, race);
    const a = await probe(page);
    expect(a.heroes.length).toBeGreaterThanOrEqual(1);
    for (const h of a.heroes) {
      expect(h.element).toBe(element);
      expect(h.parts).toBeGreaterThan(0);
      expect(h.parts).toBeLessThanOrEqual(a.cap);
    }
    expect(a.parts + a.segs).toBeGreaterThan(0);
    expect(a.reduced).toBe(false);
    expect(a.highContrast).toBe(false);
    await step(page, 20);
    const b = await probe(page);
    expect(b.heroes[0]?.age ?? 0).toBeGreaterThan(a.heroes[0]?.age ?? 0);
    await shot(page, element);
    expect(errors).toEqual([]);
  });
}

for (const [race, element] of RACES) {
  test(`${race}: the ${element} aura is clearly visible in pixels (shown vs hidden, same frame)`, async ({ page }) => {
    await setup(page, race);
    await hide(page, true);
    await settle(page);
    const off1 = await dataUrl(page);
    const off2 = await dataUrl(page);
    await hide(page, false);
    await settle(page);
    const on = await dataUrl(page);
    const noise = await pixelDiff(page, off1, off2);
    const d = await pixelDiff(page, on, off1);
    if (SHOT_DIR) {
      mkdirSync(SHOT_DIR, { recursive: true });
      writeFileSync(`${SHOT_DIR}/idle-${element}-vis-on.png`, Buffer.from(on.split(',')[1] ?? '', 'base64'));
      writeFileSync(`${SHOT_DIR}/idle-${element}-vis-off.png`, Buffer.from(off1.split(',')[1] ?? '', 'base64'));
    }
    // Two heroes of ~160x160 px: the aura must change at least ~2500 px of the band and add real light, beyond shot noise.
    expect(d.n, `${element} changed pixels (noise ${String(noise.n)})`).toBeGreaterThan(Math.max(2500, noise.n * 3));
    expect(d.sum / Math.max(1, d.n), `${element} mean change`).toBeGreaterThan(40);
  });
}

test('an undisturbed hero is not dimmed and carries a front layer', async ({ page }) => {
  await setup(page, 'sindarosa');
  const calm = await probe(page);
  expect(calm.heroes.every((h) => h.dim === 1)).toBe(true);
  expect(calm.front).toBeGreaterThan(0);
});

test('air strikes obey the flash budget: three a second at most, 17 ticks apart per hero', async ({ page }) => {
  await setup(page, 'cyclonius');
  for (let i = 0; i < 400; i++) await page.evaluate(`window.__TTE__.arena.step(1)`);
  const { strikes } = await probe(page);
  const ticks = strikes.map((s) => s.tick);
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i] ?? 0;
    expect(ticks.filter((u) => u >= t && u < t + 50).length).toBeLessThanOrEqual(3);
    const own = strikes.filter((s) => s.id === strikes[i]?.id && s.tick !== t).map((s) => Math.abs(s.tick - t));
    for (const gap of own) expect(gap).toBeGreaterThanOrEqual(17);
  }
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the aura holds still: no strikes, and the same parts over time', async ({ page }) => {
    await setup(page, 'cyclonius');
    const a = await probe(page);
    expect(a.reduced).toBe(true);
    await step(page, 120);
    const b = await probe(page);
    expect(b.strikes).toEqual([]);
    expect(b.parts).toBe(a.parts);
    expect(b.segs).toBe(a.segs);
    await shot(page, 'reduced-motion');
  });
});

test.describe('high contrast', () => {
  test.use({ contrast: 'more' });
  test('few crisp parts per hero', async ({ page }) => {
    await setup(page, 'sindarosa');
    const a = await probe(page);
    expect(a.highContrast).toBe(true);
    for (const h of a.heroes) expect(h.parts).toBeLessThanOrEqual(6);
    await shot(page, 'high-contrast');
  });
});
