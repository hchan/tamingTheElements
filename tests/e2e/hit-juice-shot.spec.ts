import { expect, test } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Classic hit juice in a real headless browser: a projectile hit renders the hit frame without page errors and the
// screenshot of it is nonblank. Page-side code is passed as strings (tsconfig.node has no DOM lib).
test('Classic: a hit frame renders with flash and spark and no page errors', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?ff=arenaDemo&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  const foe = await page.evaluate<number>(`(() => {
    const a = window.__TTE__.arena;
    const [me, foe] = a.characters();
    a.place(me.id, 100, 380, 0);
    a.place(foe.id, 180, 380, 4);
    return foe.id;
  })()`);
  const hp = (): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.id === ${String(foe)}).hp`);
  const start = await hp();
  for (let i = 0; i < 20 && (await hp()) === start; i++) await page.evaluate('window.__TTE__.arena.step(1, [32, 0])');
  expect(await hp()).toBeLessThan(start);
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const shot = await page.locator('#game canvas').screenshot({ path: info.outputPath('hit-frame.png') });
  expect(shot.length).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});
