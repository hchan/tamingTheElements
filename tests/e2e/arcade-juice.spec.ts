import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Hit feedback in the browser (WP-arcade-juice-hits, VISUAL-QA V6). Page-side code is passed as strings because
// tsconfig.node has no DOM lib. Manual stepping keeps the driver paused, and paused effects hold their frame, so what a
// step produced is still on screen when the probe reads it.
const SECONDARY = 32;
const PRIMARY = 16;
/** Arcade Charge (FUN-DESIGN 2.17): its arrival hit stuns, so the Ice Shock pressed after its hit-stop (it lands 6 ticks on) is the combo's second hit. */
const CHARGE = 1 << 15;
const WASH = 0x6e6e6e;
const ADD = 2;
/** Arcade round 1's intro (FUN-DESIGN 2.10): nobody acts until tick 91; Classic has none. */
const INTRO = 91;

interface Fx {
  tints: { id: number; tint: number; mode: number }[];
  numbers: string[];
  combo: [number, number];
  meter: [number, number];
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
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
const flashed = (f: Fx, id: number): boolean => f.tints.some((t) => t.id === id && t.tint === WASH && t.mode === ADD);

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

test('Classic: once the white flash ends the hit leaves a red tint, then clears', async ({ page }) => {
  const errors = collectErrors(page);
  const foe = await openDemo(page, 'arenaDemo');
  await hit(page, foe);
  expect(flashed(await fx(page), foe)).toBe(true);
  // Let the view effects age on real frames (sim stays paused): fill, then red, then nothing.
  await page.evaluate(`window.__TTE__.arena.ageFx(true)`);
  await page.waitForFunction(`window.__TTE__.arena.fx().tints.some((t) => t.id === ${String(foe)} && t.tint === 0xff3a3a && t.mode === 0)`, undefined, { timeout: 5000 });
  await page.waitForFunction(`!window.__TTE__.arena.fx().tints.some((t) => t.id === ${String(foe)} && t.tint === 0xff3a3a)`, undefined, { timeout: 5000 });
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
  expect(f.numbers.length).toBeGreaterThanOrEqual(2);
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
