import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Arcade melee Charge view (WP-arcade-charge, FUN-DESIGN 2.17): the CHARGE! pop, afterimages along the rush, the
// live-region line, the H key and the touch Charge button; reduced motion keeps the word and the line and drops the
// afterimages; 0 listeners after leaving. Page-side code is passed as strings (no DOM lib in tsconfig.node).

interface Defence {
  ghosts: number;
  pops: string[];
}

/** Round 1's intro (FUN-DESIGN 2.10): nobody acts until tick 91. */
const INTRO = 91;

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const defence = async (page: Page): Promise<Defence | undefined> => {
  await frames(page);
  return page.evaluate<Defence | undefined>(`window.__TTE__.arena.defence()`);
};
const live = (page: Page): Promise<string> =>
  page.evaluate<string>(`[document.getElementById('liveRegion'), document.getElementById('liveRegionAssertive')].map((n) => n ? n.textContent : '').join(' | ')`);

async function place(page: Page): Promise<void> {
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 200, 360, 0); a.place(foe.id, 1100, 360, 4); })()`);
}

/** Pax (melee) against Sindarosa, past the intro, Pax far to the left of her. */
async function start(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('pax');
  await page.getByLabel('AI race').selectOption('sindarosa');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  await place(page);
}

test('Arcade Versus: H rushes Pax at the foe: CHARGE! pop, afterimages, a spoken line; 0 listeners after', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await expect(page.locator('#arcadeCharge')).toBeVisible();
  const x0 = await page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.team === 0).x`);
  await page.keyboard.down('KeyH');
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.keyboard.up('KeyH');
  await page.evaluate(`window.__TTE__.arena.stepLive(4)`);
  const d = await defence(page);
  expect(d?.pops).toContain('CHARGE!');
  expect(d?.ghosts).toBeGreaterThan(0);
  expect(await page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.team === 0).x`)).toBeGreaterThan(x0 + 40);
  await expect.poll(() => live(page), { timeout: 5000 }).toContain('You charged.');

  await page.keyboard.press('Shift+P');
  await page.waitForFunction(`window.__TTE__.arena.paused === false`);
  await page.keyboard.press('Shift+P');
  await page.getByRole('link', { name: 'Exit to menu' }).click();
  await page.waitForFunction(`window.location.hash === '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  await expect(page.locator('#arcadeCharge')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});

test('reduced motion: the charge keeps the CHARGE! word and the line but draws no afterimages', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await page.keyboard.down('KeyH');
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.keyboard.up('KeyH');
  await page.evaluate(`window.__TTE__.arena.stepLive(4)`);
  const d = await defence(page);
  expect(d?.pops).toContain('CHARGE!');
  expect(d?.ghosts).toBe(0);
  await expect.poll(() => live(page), { timeout: 5000 }).toContain('You charged.');
});

test('the touch Charge button holds the charge key while pressed', async ({ page }) => {
  await start(page);
  await page.locator('#arcadeCharge').hover();
  await page.mouse.down();
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.mouse.up();
  await page.evaluate(`window.__TTE__.arena.stepLive(4)`);
  const d = await defence(page);
  expect(d?.pops).toContain('CHARGE!');
  expect(d?.ghosts).toBeGreaterThan(0);
});
