import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters, collectErrors } from './parity/helpers';

// Arcade defence view (WP-arcade-defence-view, FUN-DESIGN 2.7, 2.8 and section 3): the guard shield and guard bar, chip
// sparks, the parry flash, ping and PARRY pop, dash afterimages and projectile trails (VISUAL-QA V10); reduced motion
// keeps the information and drops the motion; Classic never loads the chunk; the E and Q keys and the touch Guard and
// Dash buttons; live-region lines; 0 listeners after leaving. Page-side code is passed as strings because tsconfig.node
// has no DOM lib. Manual stepping: effects run on the view tick, so they hold between steps.

interface Defence {
  ghosts: number;
  trails: number;
  shields: number;
  bars: number[];
  projectiles: number;
  sparks: number;
  rings: number;
  pops: string[];
}

const UP = 1 << 0;
const LEFT = 1 << 2;
const PRIMARY = 1 << 4;
const SECONDARY = 1 << 5;
const DASH = 1 << 11;
const GUARD = 1 << 12;
/** Round 1's intro (FUN-DESIGN 2.10): nobody acts until tick 91. */
const INTRO = 91;
/** Curomo's Ice Shock cooldown (59 ticks), longer than the parry window and its whiff lock (29 ticks after a press). */
const COOLDOWN = 60;

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const defence = async (page: Page): Promise<Defence | undefined> => {
  await frames(page);
  return page.evaluate<Defence | undefined>(`window.__TTE__.arena.defence()`);
};
const step = (page: Page, n: number, cmds: [number, number] = [0, 0]): Promise<unknown> =>
  page.evaluate(`window.__TTE__.arena.step(${String(n)}, [${String(cmds[0])}, ${String(cmds[1])}])`);
const live = (page: Page): Promise<string> =>
  page.evaluate<string>(`[document.getElementById('liveRegion'), document.getElementById('liveRegionAssertive')].map((n) => n ? n.textContent : '').join(' | ')`);

/** Demo arena (Curomo vs Pax) past the intro, Curomo 80 px left of Pax, facing: Ice Shock lands the next tick. */
async function demo(page: Page, ff: string, foeX = 180): Promise<void> {
  await page.goto(`/?ff=${ff}&manual=1&seed=7`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(INTRO)});
    const [me, foe] = a.characters();
    a.place(me.id, 100, 380, 0);
    a.place(foe.id, ${String(foeX)}, 380, 4);
  })()`);
}

/**
 * Steps (Curomo casting Ice Shock, Pax guarding) until Pax's guard bar drops: a guarded hit. Ice Shock, not Shards of
 * Ice: in Arcade Curomo's secondary is Snag (FUN-DESIGN 2.20), which a guard wastes without chip.
 */
async function guardedHit(page: Page): Promise<void> {
  // Held past the parry window first, so the hit is guarded, not parried.
  await step(page, 12, [0, GUARD]);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; for (let i = 0; i < 40; i++) a.step(1, [${String(PRIMARY)}, ${String(GUARD)}]); })()`);
}

/**
 * Pax presses guard, then Curomo casts Ice Shock (it lands the next tick, so inside the parry window); tried a few times
 * (from the same places, after its cooldown and the whiff lock). Returns the attempt that parried, or 0.
 */
async function parry(page: Page): Promise<number> {
  for (let i = 1; i <= 4; i++) {
    await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(${String(COOLDOWN)}); const [me, foe] = a.characters(); a.place(me.id, 100, 380, 0); a.place(foe.id, 180, 380, 4); })()`);
    await step(page, 1, [0, GUARD]);
    await step(page, 1, [PRIMARY, 0]);
    await step(page, 3);
    if ((await defence(page))?.pops.includes('PARRY')) return i;
  }
  return 0;
}

/** Curomo, once free, dashes up (the dash moves him well over 30 px in 6 ticks). */
async function dash(page: Page): Promise<void> {
  const myY = (): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.team === 0).y`);
  await step(page, 40);
  const before = await myY();
  await step(page, 1, [DASH | UP, 0]);
  await step(page, 5);
  expect(before - (await myY())).toBeGreaterThan(30);
}

/**
 * A new Arcade Versus match (Sindarosa vs Pax; the demo's Curomo has no projectile in Arcade, his Shards of Ice slot is
 * Snag, FUN-DESIGN 2.20): Sindarosa far from Pax casts Fire Blast; returns the trail dots drawn 4 ticks into the flight
 * (after checking that the shot flies).
 */
async function trails(page: Page): Promise<number> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('sindarosa');
  await page.getByLabel('AI race').selectOption('pax');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(${String(INTRO)}); const [me, foe] = a.characters(); a.place(me.id, 300, 360, 0); a.place(foe.id, 1100, 360, 4); })()`);
  await step(page, 1, [PRIMARY, 0]);
  await step(page, 4);
  const d = await defence(page);
  expect(d?.projectiles).toBeGreaterThan(0);
  return d?.trails ?? -1;
}

test('Arcade: the guard shield and bar, chip sparks, a parry with its flash, ping and pop, a dash and trails', async ({ page }) => {
  const errors = collectErrors(page);
  await demo(page, 'arenaDemo,arcade');
  await expect.poll(async () => defence(page)).toMatchObject({ shields: 0, bars: [] });
  await step(page, 2, [0, GUARD]);
  expect(await defence(page)).toMatchObject({ shields: 1 });
  await guardedHit(page);
  const guarded = await defence(page);
  expect(guarded?.shields).toBe(1);
  expect(guarded?.bars.length).toBe(1);
  expect(guarded?.bars[0]).toBeLessThan(1000);
  // Released, the bar stays up while the meter refills.
  await step(page, 2);
  expect(await defence(page)).toMatchObject({ shields: 0 });
  expect((await defence(page))?.bars.length).toBe(1);
  expect(await parry(page)).toBeGreaterThan(0);
  const parried = await defence(page);
  expect(parried?.rings).toBeGreaterThan(0);
  expect(parried?.pops).toContain('PARRY');
  // Curomo (stunned by the parried Ice Shock) recovers, then dashes up: afterimages behind him.
  await dash(page);
  expect((await defence(page))?.ghosts).toBeGreaterThan(0);
  // From across the arena, a Fire Blast leaves trails.
  expect(await trails(page)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('reduced motion: no afterimages or trails, but the shield, bar, rings and pops stay; Classic never loads the view', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await demo(page, 'arenaDemo');
  await step(page, 120, [SECONDARY | DASH, GUARD]);
  await frames(page);
  expect(requested.filter((u) => u.includes('defence-view'))).toEqual([]);
  expect(await page.evaluate(`window.__TTE__.arena.defence()`)).toBeUndefined();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await demo(page, 'arenaDemo,arcade');
  await guardedHit(page);
  expect(await defence(page)).toMatchObject({ shields: 1 });
  expect(await parry(page)).toBeGreaterThan(0);
  const parried = await defence(page);
  expect(parried?.rings).toBeGreaterThan(0);
  expect(parried?.pops).toContain('PARRY');
  await dash(page);
  expect((await defence(page))?.ghosts).toBe(0);
  expect(await trails(page)).toBe(0);
});

test('Arcade Versus: Q guards and E dashes, the touch Guard and Dash buttons too; a guard break is spoken; 0 listeners after', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('pax');
  await page.getByLabel('AI race').selectOption('sindarosa');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await step(page, INTRO);
  await expect(page.locator('#arcadeGuard')).toBeVisible();
  await expect(page.locator('#arcadeDash')).toBeVisible();
  await expect(page.locator('#arcadeSuper')).toBeVisible();
  // Keys (live ticks: the keyboard agent plays the player, the AI plays on).
  await page.keyboard.down('KeyQ');
  await page.evaluate(`window.__TTE__.arena.stepLive(2)`);
  expect((await defence(page))?.shields).toBe(1);
  await page.keyboard.up('KeyQ');
  await page.evaluate(`window.__TTE__.arena.stepLive(2)`);
  expect((await defence(page))?.shields).toBe(0);
  await page.keyboard.down('KeyE');
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.keyboard.up('KeyE');
  await page.evaluate(`window.__TTE__.arena.stepLive(3)`);
  expect((await defence(page))?.ghosts).toBeGreaterThan(0);
  // The touch Guard button holds the guard key while pressed.
  await page.evaluate(`window.__TTE__.arena.stepLive(40)`);
  await page.locator('#arcadeGuard').hover();
  await page.mouse.down();
  await page.evaluate(`window.__TTE__.arena.stepLive(2)`);
  expect((await defence(page))?.shields).toBe(1);
  await page.mouse.up();
  await page.locator('#arcadeDash').hover();
  await page.mouse.down();
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.mouse.up();
  await page.evaluate(`window.__TTE__.arena.stepLive(3)`);
  expect((await defence(page))?.ghosts).toBeGreaterThan(0);

  // Pax holds guard against Sindarosa's Fire Blasts on the same row until the guard breaks.
  const [me] = await characters(page, 0);
  const [foe] = await characters(page, 1);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.place(${String(me?.id)}, 300, 360, 0); a.place(${String(foe?.id)}, 700, 360, 4); })()`);
  const broke = await page.evaluate<boolean>(`(async () => {
    const a = window.__TTE__.arena;
    // One press of left points the AI's 8-way aim back along the row (its live moves may have turned it).
    a.step(1, [${String(GUARD)}, ${String(LEFT)}]);
    for (let i = 0; i < 150; i++) {
      a.step(10, [${String(GUARD)}, ${String(PRIMARY)}]);
      if ((await a.defence()).pops.includes('GUARD BREAK')) return true;
    }
    return false;
  })()`);
  expect(broke).toBe(true);
  await expect.poll(() => live(page), { timeout: 5000 }).toContain('Your guard broke.');

  await page.keyboard.press('Shift+P');
  await page.waitForFunction(`window.__TTE__.arena.paused === false`);
  await page.keyboard.press('Shift+P');
  await page.getByRole('link', { name: 'Exit to menu' }).click();
  await page.waitForFunction(`window.location.hash === '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  await expect(page.locator('#arcadeGuard')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});
