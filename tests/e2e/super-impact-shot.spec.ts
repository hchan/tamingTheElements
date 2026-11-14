import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, collectErrors } from './parity/helpers';

// A super's hit reads big: an oversized gold damage number (sized by the share of the victim's life) and one screen pulse.
// Manual stepping keeps the sim paused, so shockSeek jumps the effect to a frame and the screenshot catches it.
// Reduced motion keeps a still number but no pulse. Page-side code is passed as strings (no DOM lib in tsconfig.node).
const SUPER = 1 << 13;
const INTRO = 91;

interface Shock {
  rings: number;
  superNumbers: number;
  superNumberSize: number;
}
const shock = (page: Page): Promise<Shock | undefined> => page.evaluate<Shock | undefined>(`window.__TTE__.arena.shockFx()`);
const frames = (page: Page): Promise<unknown> => page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');

async function superHit(page: Page): Promise<void> {
  await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(INTRO)});
    const [me, foe] = a.characters();
    a.place(me.id, 300, 360, 0);
    a.place(foe.id, 450, 360, 4);
    a.setMeter(0, 1000);
    a.step(1, [${String(SUPER)}, 0]);
    a.step(60);
  })()`);
}

test('Arcade: a super hit throws a big gold number and a screen pulse (frames captured)', async ({ page }, info) => {
  const errors = collectErrors(page);
  await superHit(page);
  const s = await shock(page);
  expect(s?.superNumbers).toBeGreaterThan(0);
  expect(s?.superNumberSize).toBeGreaterThan(60);
  await page.evaluate(`window.__TTE__.arena.shockSeek(70)`);
  await frames(page);
  expect((await page.locator('#game canvas').screenshot({ path: info.outputPath('super-pop.png') })).length).toBeGreaterThan(2000);
  await page.evaluate(`window.__TTE__.arena.shockSeek(400)`);
  await frames(page);
  expect((await page.locator('#game canvas').screenshot({ path: info.outputPath('super-hold.png') })).length).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});

test('reduced motion: the super number stays (still), no pulse or rings', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = collectErrors(page);
  await superHit(page);
  const s = await shock(page);
  expect(s?.superNumbers).toBeGreaterThan(0);
  expect(s?.rings).toBe(0);
  expect(errors).toEqual([]);
});
