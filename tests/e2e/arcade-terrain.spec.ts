import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Arcade terrain view (WP-arcade-terrain-view, FUN-DESIGN 2.15 and section 3): an Arcade match draws the stage patches
// (one word label each); Sunshine turns the stage to fire (the 30-tick telegraph, then the new layout); a fire hero
// standing in a fire patch gets the FIRE x2 buff badge (the hero is moved with the test hook); the live region speaks the
// change; the aim arrow hides at the bottom edge; Classic never loads the chunk; 0 listeners after leaving. Page-side
// code is passed as strings because tsconfig.node has no DOM lib. Manual stepping: the view runs on the view tick.

interface Terrain {
  stage: number;
  patches: number;
  rects: number[];
  labels: string[];
  alpha: number;
  particles: number;
  backdrop: string;
  nextBackdrop: number;
  badge: string;
}

const WEATHER = 1 << 14;
/** Round 1's intro (FUN-DESIGN 2.10): nobody acts until tick 91. */
const INTRO = 91;

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const terrain = async (page: Page): Promise<Terrain | undefined> => {
  await frames(page);
  return page.evaluate<Terrain | undefined>(`window.__TTE__.arena.terrain()`);
};
const step = (page: Page, n: number, cmds: [number, number] = [0, 0]): Promise<unknown> =>
  page.evaluate(`window.__TTE__.arena.step(${String(n)}, [${String(cmds[0])}, ${String(cmds[1])}])`);
const live = (page: Page): Promise<string> =>
  page.evaluate<string>(`[document.getElementById('liveRegion'), document.getElementById('liveRegionAssertive')].map((n) => n ? n.textContent : '').join(' | ')`);

test('Classic never loads the terrain view and has no terrain probe', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await page.goto('/?ff=arenaDemo&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await step(page, 60);
  await frames(page);
  expect(requested.filter((u) => u.includes('terrain-view'))).toEqual([]);
  expect(await page.evaluate(`window.__TTE__.arena.terrain()`)).toBeUndefined();
});

test('Arcade Versus: patches drawn, Sunshine turns the stage to fire, the buff badge shows in a fire patch; 0 listeners after', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('sindarosa');
  await page.getByLabel('AI race').selectOption('cyclonius');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await step(page, INTRO);

  // Whatever stage the seed drew: its patches are on screen, each with a word (not colour alone) and the stage's backdrop.
  const first = await terrain(page);
  expect(first?.stage).toBeGreaterThanOrEqual(1);
  expect(first?.patches).toBeGreaterThanOrEqual(3);
  expect(first?.labels).toHaveLength(first?.patches ?? -1);
  expect(first?.labels.every((l) => l.length > 2)).toBe(true);
  expect(first?.backdrop).toBe(['fire', 'water', 'earth', 'air'][(first?.stage ?? 1) - 1]);

  // Sindarosa (fire) calls Sunshine; if the stage is not fire yet it swaps after the telegraph.
  await page.evaluate(`window.__TTE__.arena.setWeatherCharge(0, 1000)`);
  await step(page, 1, [WEATHER, 0]);
  await step(page, 5);
  if (first?.stage !== 1) {
    const mid = await terrain(page);
    expect(mid?.alpha).toBeLessThan(1); // the old patches fade during the telegraph
    expect(mid?.nextBackdrop).toBeGreaterThan(0);
    await expect.poll(() => live(page), { timeout: 5000 }).toContain('The stage will turn to fire.');
    await step(page, 40);
  }
  const fire = await terrain(page);
  expect(fire).toMatchObject({ stage: 1, backdrop: 'fire', nextBackdrop: 0 });
  expect(fire?.labels.every((l) => l === 'FIRE x2')).toBe(true);
  expect(fire?.patches).toBeGreaterThanOrEqual(3);
  if (first?.stage !== 1) await expect.poll(() => live(page), { timeout: 5000 }).toContain('The stage turns to fire.');

  // Out of every patch: no badge. Into the first fire patch (hero centre inside): FIRE x2.
  const r = fire?.rects ?? [];
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const me = a.characters().find((c) => c.team === 0); a.place(me.id, 1, 205, 0); a.step(2); })()`);
  expect((await terrain(page))?.badge).toBe('');
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const me = a.characters().find((c) => c.team === 0); a.place(me.id, ${String((r[0] ?? 0) + (r[2] ?? 0) / 2 - 40)}, ${String((r[1] ?? 0) + (r[3] ?? 0) / 2 - 40)}, 0); a.step(2); })()`);
  expect((await terrain(page))?.badge).toBe('FIRE x2');
  await expect.poll(() => live(page), { timeout: 5000 }).toContain('You stand on a fire patch: damage doubled.');

  // The aim arrow is hidden when the fighter is at the bottom edge of the playfield and aims south (it would draw over the action bar).
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const me = a.characters().find((c) => c.team === 0); a.place(me.id, 40, 400, 0); a.step(150, [2, 0]); })()`);
  await frames(page);
  expect(await page.evaluate<{ visible: boolean } | undefined>(`window.__TTE__.arena.aim()`)).toMatchObject({ visible: false });

  await page.keyboard.press('Shift+P');
  await page.waitForFunction(`window.__TTE__.arena.paused === false`);
  await page.keyboard.press('Shift+P');
  await page.getByRole('link', { name: 'Exit to menu' }).click();
  await page.waitForFunction(`window.location.hash === '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});
