import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Manual stepping holds frame-timed view effects (white pops, rings, sparks, wash) until the test hook's ageFx(true) lets them
// age on real frames. Page-side code is passed as strings because tsconfig.node has no DOM lib.
/** Arcade Charge: its arrival hit is the first, unscaled hit, so it spawns a white pop and no HUD number. */
const CHARGE = 1 << 15;
/** Arcade round 1's intro: nobody acts until tick 91. */
const INTRO = 91;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /has no frame|missing frame/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openDemo(page: Page, ff: string): Promise<number> {
  await page.goto(`/?ff=${ff}&manual=1&seed=7`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  return page.evaluate<number>(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(INTRO)});
    const [me, foe] = a.characters();
    a.place(me.id, 700, 380, 0);
    a.place(foe.id, 780, 380, 4);
    return foe.id;
  })()`);
}

async function hit(page: Page, foe: number, cmd: number): Promise<void> {
  const hp = (): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.id === ${String(foe)}).hp`);
  const start = await hp();
  for (let i = 0; i < 20 && (await hp()) === start; i++) await page.evaluate(`window.__TTE__.arena.step(1, [${String(cmd)}, 0])`);
  expect(await hp()).toBeLessThan(start);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
}

const shock = (page: Page): Promise<{ pops: number; rings: number } | undefined> =>
  page.evaluate<{ pops: number; rings: number } | undefined>(`window.__TTE__.arena.shockFx()`);

test('manual stepping: a white damage pop holds its frame until ageFx(true) ages it out', async ({ page }, info) => {
  test.slow(); // SwiftShader under load can render ~3 fps; see the ageing poll below
  await page.emulateMedia({ reducedMotion: 'no-preference' }); // reduced motion shows a HUD number instead of a pop
  const errors = collectErrors(page);
  const foe = await openDemo(page, 'arenaDemo,arcade');
  await hit(page, foe, CHARGE);
  expect((await shock(page))?.pops ?? 0).toBeGreaterThanOrEqual(1);
  await page.locator('#game canvas').screenshot({ path: info.outputPath('pop-held.png') });
  for (let i = 0; i < 10; i++) await page.evaluate(`new Promise((r) => requestAnimationFrame(r))`);
  expect((await shock(page))?.pops ?? 0).toBeGreaterThanOrEqual(1); // still held
  await page.evaluate(`window.__TTE__.arena.ageFx(true)`);
  // Phaser caps each frame's delta at 16.7 ms, so the 640 ms pop needs ~40 frames however slow they are: about 12 s at the ~3 fps
  // a loaded PC's SwiftShader renders (measured on the PC), hence the long poll.
  await expect
    .poll(async () => {
      const s = await shock(page);
      return s ? s.pops + s.rings : 0;
    }, { timeout: 40_000 })
    .toBe(0);
  const shot = await page.locator('#game canvas').screenshot({ path: info.outputPath('pop-aged-out.png') });
  expect(shot.length).toBeGreaterThan(2000);
  await page.evaluate(`window.__TTE__.arena.ageFx(false)`);
  expect(errors).toEqual([]);
});
