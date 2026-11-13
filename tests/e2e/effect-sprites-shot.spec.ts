import { expect, test } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Painted effect sprites (looping projectile strip and element impact) in a real headless browser: a projectile in flight and
// the frame just after its hit render without page errors. Screenshots go to the test output dir for a visual check.
test('effect sprites: projectile in flight and impact render without page errors', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?ff=arenaDemo&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  const foe = await page.evaluate<number>(`(() => {
    const a = window.__TTE__.arena;
    const [me, foe] = a.characters();
    a.place(me.id, 100, 380, 0);
    a.place(foe.id, 420, 380, 4);
    return foe.id;
  })()`);
  const hp = (): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.id === ${String(foe)}).hp`);
  const start = await hp();
  await page.evaluate('window.__TTE__.arena.step(1, [32, 0])');
  await page.evaluate('window.__TTE__.arena.step(8, [0, 0])');
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const flight = await page.locator('#game canvas').screenshot({ path: info.outputPath('flight.png') });
  expect(flight.length).toBeGreaterThan(2000);
  for (let i = 0; i < 60 && (await hp()) === start; i++) await page.evaluate('window.__TTE__.arena.step(1, [0, 0])');
  expect(await hp()).toBeLessThan(start);
  await page.waitForTimeout(160); // wall-clock: the impact strip plays on scene time (about 360 ms)
  const hit = await page.locator('#game canvas').screenshot({ path: info.outputPath('impact.png') });
  expect(hit.length).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});
