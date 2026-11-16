import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Depth step on supers (P3D-1, Arcade): the caster drops, dollies in (unboxed rigs only, ADR-0020) and the shadow follows.
// SHOT_DIR=<dir> saves headless screenshots. Manual stepping, polled, no timeouts.
const SUPER = 1 << 13;
const INTRO = 91;
const SHOT_DIR = process.env['SHOT_DIR'];

interface Drawn { id: number; depth: number; dolly: number; bodyHeight: number }

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
async function mine(page: Page): Promise<Drawn | undefined> {
  return page.evaluate<Drawn | undefined>(`window.__TTE__.arena.sheets().then((p) => p ? p.characters[0] : undefined)`);
}
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await frames(page);
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}
async function setup(page: Page, query: string): Promise<void> {
  await page.goto(`/?ff=arenaDemo,arcade&manual=1&seed=7${query}`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(INTRO)});
    const [me, foe] = a.characters();
    a.place(me.id, 300, 360, 0);
    a.place(foe.id, 900, 360, 4);
    a.setMeter(0, 1000);
  })()`);
  await expect.poll(async () => (await mine(page))?.bodyHeight ?? 0).toBeGreaterThan(0);
}
const press = (page: Page): Promise<unknown> => page.evaluate(`window.__TTE__.arena.step(1, [${String(SUPER)}, 0])`);
const stepOne = async (page: Page): Promise<void> => {
  await page.evaluate(`window.__TTE__.arena.step(1)`);
  await frames(page);
};

test('Fiara super: drops, dollies in, then releases', async ({ page }) => {
  await setup(page, '&p1=fiara');
  const before = (await mine(page))?.bodyHeight ?? 0;
  await press(page);
  await expect.poll(async () => { await frames(page); return (await mine(page))?.depth ?? 0; }).toBeGreaterThanOrEqual(0.9);
  const peak = await mine(page);
  expect(peak?.dolly).toBeGreaterThan(1.04);
  expect(peak?.bodyHeight).toBeGreaterThan(before);
  await shot(page, 'super-peak');
  let n = 0;
  for (let i = 0; i < 60; i++) {
    await stepOne(page);
    if (((await mine(page))?.depth ?? 0) < 0.05) break;
    if (i % 3 === 0) await shot(page, `super-release-${String(n++).padStart(2, '0')}`);
  }
  await expect.poll(async () => { await stepOne(page); return (await mine(page))?.depth ?? 1; }).toBeLessThan(0.05);
});

test('Curomo (boxed) super: drops but never scales', async ({ page }) => {
  await setup(page, '');
  const before = (await mine(page))?.bodyHeight ?? 0;
  await press(page);
  await expect.poll(async () => { await frames(page); return (await mine(page))?.depth ?? 0; }).toBeGreaterThanOrEqual(0.9);
  const peak = await mine(page);
  expect(peak?.dolly).toBe(1);
  expect(Math.abs((peak?.bodyHeight ?? 0) - before)).toBeLessThanOrEqual(1);
  await shot(page, 'curomo-super-peak');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('depth stays 0', async ({ page }) => {
    await setup(page, '&p1=fiara');
    await press(page);
    for (let i = 0; i < 8; i++) {
      await stepOne(page);
      expect((await mine(page))?.depth).toBe(0);
    }
  });
});
