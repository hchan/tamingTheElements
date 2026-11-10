import { expect, test, type Page } from '@playwright/test';

// Hit feedback in the browser (WP-arcade-juice-hits, VISUAL-QA V6). Page-side code is passed as strings because
// tsconfig.node has no DOM lib. Manual stepping keeps the driver paused, and paused effects hold their frame, so what a
// step produced is still on screen when the probe reads it.
const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`;
const SECONDARY = 32;
const WHITE = 0xffffff;
const FILL = 1;

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

/** Demo arena (Curomo vs Pax), the two placed 80 px apart and facing: Curomo's Shards of Ice land on the next ticks. */
async function openDemo(page: Page, ff: string): Promise<number> {
  await page.goto(`/?ff=${ff}&manual=1&seed=7`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  return page.evaluate<number>(`(() => {
    const a = window.__TTE__.arena;
    const [me, foe] = a.characters();
    a.place(me.id, 500, 360, 0);
    a.place(foe.id, 580, 360, 4);
    return foe.id;
  })()`);
}

/** Steps with Curomo firing until the foe loses health, then lets two frames render. */
async function hit(page: Page, foe: number): Promise<void> {
  const hp = (): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.id === ${String(foe)}).hp`);
  const start = await hp();
  for (let i = 0; i < 20 && (await hp()) === start; i++) await page.evaluate(`window.__TTE__.arena.step(1, [${String(SECONDARY)}, 0])`);
  expect(await hp()).toBeLessThan(start);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
}

const fx = (page: Page): Promise<Fx> => page.evaluate<Fx>(`window.__TTE__.arena.fx()`);
const flashed = (f: Fx, id: number): boolean => f.tints.some((t) => t.id === id && t.tint === WHITE && t.mode === FILL);

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

test('Arcade: flash, damage numbers and combo counter; they hold while paused', async ({ page }) => {
  const errors = collectErrors(page);
  const foe = await openDemo(page, 'arenaDemo,arcade');
  await hit(page, foe);
  await page.evaluate(`window.__TTE__.arena.step(3, [${String(SECONDARY)}, 0])`);
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
  await hit(page, foe);
  await page.evaluate(`window.__TTE__.arena.step(3, [${String(SECONDARY)}, 0])`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const f = await fx(page);
  expect(flashed(f, foe)).toBe(true);
  expect(f.numbers.length).toBeGreaterThanOrEqual(1);
  expect(f.combo[0]).toBeGreaterThanOrEqual(2);
  expect(f.meter[0]).toBeGreaterThan(0);
  expect(await page.evaluate<boolean>(`window.__TTE__.arena.shaking()`)).toBe(false);
  expect(errors).toEqual([]);
});
