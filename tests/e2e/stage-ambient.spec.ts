import { expect, test } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Stage ambient motion (stage-selection-hazards, ambient part; presentation only): each element's arena runs a few soft
// particle layers behind the fighters, capped in number, and none under reduced motion. Screenshots go to the test output
// dir (set AMBIENT_OUT to keep them elsewhere).
const CASES: ReadonlyArray<readonly [string, string]> = [['fire', 'lavax'], ['water', 'curomo'], ['earth', 'rokcore'], ['air', 'cyclonius']];
const CAP = 48;

const open = async (page: import('@playwright/test').Page, hero: string, flags = ''): Promise<void> => {
  await page.goto(`/?ff=arenaDemo${flags}&manual=1&seed=7&p1=${hero}`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
};
const ambient = (page: import('@playwright/test').Page): Promise<{ emitters: number; particles: number }> =>
  page.evaluate<{ emitters: number; particles: number }>('window.__TTE__.arena.stageAmbient()');

test.describe('stage ambient motion', () => {
  test.use({ reducedMotion: 'no-preference' });
  for (const [element, hero] of CASES) {
    test(`${element} stage has ambient particles within the cap`, async ({ page }, info) => {
      await open(page, hero);
      await page.evaluate(`(() => {
        const a = window.__TTE__.arena;
        const [me, foe] = a.characters();
        a.place(me.id, 100, 380, 0);
        a.place(foe.id, 520, 380, 4);
      })()`);
      await expect.poll(async () => (await ambient(page)).particles, { timeout: 10_000 }).toBeGreaterThan(3);
      const s = await ambient(page);
      expect(s.emitters).toBeGreaterThan(0);
      expect(s.particles).toBeLessThanOrEqual(CAP);
      const out = process.env.AMBIENT_OUT;
      const shot = await page.locator('#game canvas').screenshot({ path: out ? `${out}/${element}-${hero}.png` : info.outputPath(`${element}-ambient.png`) });
      expect(shot.length).toBeGreaterThan(2000);
    });
  }
});

test.describe('stage ambient motion under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('runs no emitters', async ({ page }) => {
    await open(page, 'lavax');
    await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    expect(await ambient(page)).toEqual({ emitters: 0, particles: 0 });
  });
});
