import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Pseudo-3D Snag rope (P3D-3): the wraps round a rooted fighter's feet close in over a few ticks, the far half of each loop drawn
// behind the body and the near half over it. Reduced motion shows them closed at once. SHOT_DIR=<dir> saves a frame strip
// (headless; never needed to pass).

interface Defence {
  readonly roots: number;
  readonly rootBack: number;
  readonly rootFront: number;
}
const INTRO = 91;
const SNAG = 16;
const SHOT_DIR = process.env['SHOT_DIR'];
const FULL = 32; // two loops, HALF_SEGS = 16 each

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const defence = async (page: Page): Promise<Defence> => {
  await frames(page);
  const d = await page.evaluate<Defence | undefined>(`window.__TTE__.arena.defence()`);
  expect(d).toBeDefined();
  return d as Defence;
};
const shot = async (page: Page, name: string): Promise<void> => {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.locator('#game canvas').screenshot({ path: `${SHOT_DIR}/${name}.png` });
};

async function start(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('treenoc');
  await page.getByLabel('AI race').selectOption('sindarosa');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  const card = page.getByRole('button', { name: 'Got it' });
  if (await card.isVisible()) await card.click();
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 700, 360, 0); a.place(f.id, 860, 360, 4); })()`);
}

test('a Snag rope grows in, with half of each loop behind the body', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  expect((await defence(page)).roots).toBe(0);
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(SNAG)}, 0])`);
  let first: Defence | undefined;
  let grown = false;
  for (let i = 0; i < 24 && !grown; i++) {
    await page.evaluate(`window.__TTE__.arena.step(1)`);
    const d = await defence(page);
    if (d.roots > 0) {
      first ??= d;
      expect(d.rootBack).toBe(d.rootFront);
      grown = d.rootBack >= FULL;
      await shot(page, `snag-${String(i).padStart(2, '0')}`);
    }
  }
  expect(first).toBeDefined();
  expect(first?.rootBack ?? FULL).toBeLessThan(FULL);
  expect(grown).toBe(true);
  expect(errors).toEqual([]);
  await page.evaluate(`window.__TTE__.settled()`);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('shows the closed wraps at once', async ({ page }) => {
    await start(page);
    await page.evaluate(`window.__TTE__.arena.step(1, [${String(SNAG)}, 0])`);
    let d: Defence = await defence(page);
    for (let i = 0; i < 6 && d.roots === 0; i++) {
      await page.evaluate(`window.__TTE__.arena.step(1)`);
      d = await defence(page);
    }
    expect(d.roots).toBeGreaterThan(0);
    expect(d.rootBack).toBe(FULL);
    expect(d.rootFront).toBe(FULL);
    await page.evaluate(`window.__TTE__.settled()`);
  });
});

test.describe('high contrast', () => {
  test.use({ contrast: 'more' });
  test('keeps both halves', async ({ page }) => {
    await start(page);
    await page.evaluate(`window.__TTE__.arena.step(1, [${String(SNAG)}, 0])`);
    let d: Defence = await defence(page);
    for (let i = 0; i < 24 && d.rootBack < FULL; i++) {
      await page.evaluate(`window.__TTE__.arena.step(1)`);
      d = await defence(page);
    }
    expect(d.roots).toBeGreaterThan(0);
    expect(d.rootBack).toBe(FULL);
    expect(d.rootFront).toBe(FULL);
    await page.evaluate(`window.__TTE__.settled()`);
  });
});
