import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Hit feedback in the browser (WP-arcade-juice-hits, VISUAL-QA V6). Page-side code is passed as strings because
// tsconfig.node has no DOM lib. Manual stepping keeps the driver paused, and paused effects hold their frame, so what a
// step produced is still on screen when the probe reads it.
const SECONDARY = 32;
const PRIMARY = 16;
/** Arcade Charge (FUN-DESIGN 2.17): its arrival hit stuns, so the Ice Shock pressed after its hit-stop (it lands 6 ticks on) is the combo's second hit. */
const CHARGE = 1 << 15;
/** Hit flash light (QA r26): an additive copy of the sprite at alpha 0.5 for the first frames, then a soft fade of at most 0.3. */
const WASH_PEAK = 0.38;
/** Arcade round 1's intro (FUN-DESIGN 2.10): nobody acts until tick 91; Classic has none. */
const INTRO = 91;

interface Fx {
  tints: { id: number; tint: number; mode: number; wash: number }[];
  numbers: string[];
  combo: [number, number];
  meter: [number, number];
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /has no frame|missing frame/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Demo arena (Curomo vs Pax), the two placed 80 px apart and facing: Curomo's Shards of Ice (Classic) or Charge (Arcade) land within a few ticks. */
async function openDemo(page: Page, ff: string): Promise<number> {
  await page.goto(`/?ff=${ff}&manual=1&seed=7`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  return page.evaluate<number>(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(ff.includes('arcade') ? INTRO : 0)});
    const [me, foe] = a.characters();
    const x = ${String(ff.includes('arcade') ? 700 : 100)}; // Arcade's 1920 wide field: fight mid-field, clear of the left wall
    a.place(me.id, x, 380, 0);
    a.place(foe.id, x + 80, 380, 4);
    return foe.id;
  })()`);
}

/**
 * Steps with Curomo pressing `cmd` (Shards of Ice by default; in Arcade that slot is Snag, FUN-DESIGN 2.20, so the
 * Arcade tests charge) until the foe loses health, then lets two frames render.
 */
async function hit(page: Page, foe: number, cmd = SECONDARY): Promise<void> {
  const hp = (): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.id === ${String(foe)}).hp`);
  const start = await hp();
  for (let i = 0; i < 20 && (await hp()) === start; i++) await page.evaluate(`window.__TTE__.arena.step(1, [${String(cmd)}, 0])`);
  expect(await hp()).toBeLessThan(start);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
}

const fx = (page: Page): Promise<Fx> => page.evaluate<Fx>(`window.__TTE__.arena.fx()`);
/** Plain hits show a damage pop instead of a HUD number (QA r38/r39); HUD numbers stay for scaled, counter and reduced-motion hits. */
const pops = (page: Page): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.shockFx().then((s) => (s ? s.pops : 0))`);
const flashed = (f: Fx, id: number): boolean => f.tints.some((t) => t.id === id && t.wash >= WASH_PEAK);

test('Classic: a projectile hit renders the white hit flash (V6) and no Arcade HUD', async ({ page }) => {
  const errors = collectErrors(page);
  const foe = await openDemo(page, 'arenaDemo');
  await hit(page, foe);
  const f = await fx(page);
  expect(flashed(f, foe)).toBe(true);
  expect(f.numbers).toEqual([]);
  expect(f.combo).toEqual([0, 0]);
  expect(f.meter).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test('Classic: once the peak flash ends the light fades softly, then clears', async ({ page }) => {
  const errors = collectErrors(page);
  const foe = await openDemo(page, 'arenaDemo');
  await hit(page, foe);
  expect(flashed(await fx(page), foe)).toBe(true);
  // Let the view effects age on real frames (sim stays paused): peak, then a soft fade below the peak, then nothing.
  await page.evaluate(`window.__TTE__.arena.ageFx(true)`);
  await page.waitForFunction(`window.__TTE__.arena.fx().tints.some((t) => t.id === ${String(foe)} && t.wash > 0 && t.wash < ${String(WASH_PEAK)})`, undefined, { timeout: 5000 });
  await page.waitForFunction(`!window.__TTE__.arena.fx().tints.some((t) => t.id === ${String(foe)} && t.wash > 0)`, undefined, { timeout: 5000 });
  await page.evaluate(`window.__TTE__.arena.ageFx(false)`);
  expect(errors).toEqual([]);
});

test('Arcade: flash, damage numbers and combo counter; they hold while paused', async ({ page }) => {
  const errors = collectErrors(page);
  const foe = await openDemo(page, 'arenaDemo,arcade');
  await hit(page, foe, CHARGE);
  await page.evaluate(`window.__TTE__.arena.step(8, [${String(PRIMARY)}, 0])`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const f = await fx(page);
  expect(flashed(f, foe)).toBe(true);
  // Pops of near-simultaneous hits merge (popMerges), so one is enough; the combo counter below proves both hits landed.
  expect(f.numbers.length + (await pops(page))).toBeGreaterThanOrEqual(1);
  expect(f.numbers.every((n) => /^\d+( COUNTER)?$/.test(n))).toBe(true);
  expect(f.combo[0]).toBeGreaterThanOrEqual(2);
  // Hyper meter (WP-arcade-meter): the attacker gains more than the victim, both from the hits.
  expect(f.meter[1]).toBeGreaterThan(0);
  expect(f.meter[0]).toBeGreaterThan(f.meter[1]);
  // Several more frames while paused: the flash and the numbers are still there.
  for (let i = 0; i < 5; i++) await page.evaluate(`new Promise((r) => requestAnimationFrame(r))`);
  const later = await fx(page);
  expect(flashed(later, foe)).toBe(true);
  expect(later.numbers).toEqual(f.numbers);
  expect(later.numbers.length + (await pops(page))).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('Arcade with reduced motion: no shake, but the flash, numbers and combo stay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = collectErrors(page);
  const foe = await openDemo(page, 'arenaDemo,arcade');
  await hit(page, foe, CHARGE);
  await page.evaluate(`window.__TTE__.arena.step(8, [${String(PRIMARY)}, 0])`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const f = await fx(page);
  expect(flashed(f, foe)).toBe(true);
  expect(f.numbers.length).toBeGreaterThanOrEqual(1);
  expect(f.combo[0]).toBeGreaterThanOrEqual(2);
  expect(f.meter[0]).toBeGreaterThan(0);
  expect(await page.evaluate<boolean>(`window.__TTE__.arena.shaking()`)).toBe(false);
  expect(errors).toEqual([]);
});

interface Box { x: number; y: number; w: number; h: number }
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// 844x390 is a phone landscape whose view is wider than 1280 logical px: the Hud projects into its real frame there (DMGNUM-1).
for (const [vw, vh] of [[1280, 720], [844, 390]] as const) test(`Arcade ${String(vw)}x${String(vh)}: a grey damage number never prints over a live white pop, call-out or another number (DMGNUM-1)`, async ({ page }) => {
  await page.setViewportSize({ width: vw, height: vh });
  const errors = collectErrors(page);
  const foe = await openDemo(page, 'arenaDemo,arcade');
  const run = (js: string): Promise<unknown> => page.evaluate(js);
  const hpOf = (): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.id === ${String(foe)}).hp`);
  // Charge first (its arrival hit stuns), then keep attacking with the foe pinned so the combo reaches the scaled (grey) hits.
  const h0 = await hpOf();
  for (let i = 0; i < 20 && (await hpOf()) === h0; i++) await run(`window.__TTE__.arena.step(1, [${String(CHARGE)}, 0])`);
  const cycle = [PRIMARY | SECONDARY, PRIMARY | (1 << 10), PRIMARY | (1 << 6)];
  let seen = 0;
  let both = 0;
  const frame = (): Promise<unknown> => run(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const check = async (): Promise<void> => {
    const f = await page.evaluate<Fx & { numberBoxes: Box[]; popBoxes: Box[] }>(`window.__TTE__.arena.fx()`);
    const placed: Box[] = [];
    for (const n of f.numberBoxes) {
      for (const p of f.popBoxes) expect(overlaps(n, p), `number ${JSON.stringify(n)} over pop/call-out ${JSON.stringify(p)}`).toBe(false);
      for (const o of placed) expect(overlaps(n, o), `number ${JSON.stringify(n)} over number ${JSON.stringify(o)}`).toBe(false);
      placed.push(n);
    }
    if (f.numberBoxes.length > 0) seen++;
    if (f.numberBoxes.length > 0 && f.popBoxes.length > 0) both++;
  };
  for (let t = 0; t < 240; t++) {
    await run(`window.__TTE__.arena.place(${String(foe)}, 780, 380, 4)`);
    await run(`window.__TTE__.arena.step(1, [${String(cycle[t % cycle.length])}, 0])`);
    await frame();
    await check();
    if (both > 0) break;
  }
  expect(seen, 'the scene produced a grey number').toBeGreaterThan(0);
  expect(both, 'a grey number and a live pop were on screen together').toBeGreaterThan(0);
  // Let the effects age in real time while the sim stays paused: they must stay clear as the pops rise and the numbers float.
  await run(`window.__TTE__.arena.ageFx(true)`);
  for (let i = 0; i < 30; i++) {
    await run(`new Promise((r) => requestAnimationFrame(r))`);
    await check();
  }
  await run(`window.__TTE__.arena.ageFx(false)`);
  expect(errors).toEqual([]);
});
