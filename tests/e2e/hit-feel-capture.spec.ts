import { expect, test } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Hit-feel capture (QA r37): both fighters at melee range without overlap, one light strike, a frame at view ticks 0,1,2,4,8,16
// after the hit lands (hit-stop, recoil, spark, number, streaks) so a reviewer can judge plain-hit weight from a sequence, not a still.
// Frames go to $SHOT_DIR (default: the test output dir). Hero/foe via $HERO / $FOE (default fiara vs treenoc).
const shotDir = process.env['SHOT_DIR'];
const hero = process.env['HERO'] ?? 'fiara';
const foeName = process.env['FOE'] ?? 'treenoc';
const AFTER = [0, 1, 2, 4, 8, 16];
const raf = (page: import('@playwright/test').Page): Promise<unknown> => page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');

test.describe.configure({ retries: 3 });

test(`plain hit frame sequence (${hero} vs ${foeName})`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?manual=1&seed=7&hero=${hero}&foe=${foeName}`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate('window.__TTE__.arena.step(260)');
  await page.evaluate(`document.querySelector('.firstRunDone')?.click()`);
  const chars = await page.evaluate<{ id: number; team: number; hp: number }[]>('window.__TTE__.arena.characters()');
  const me = chars.find((c) => c.team === 0);
  const foe = chars.find((c) => c.team === 1);
  expect(me && foe).toBeTruthy();
  // 160 px apart: inside melee reach, clear of overlap.
  await page.evaluate(`window.__TTE__.arena.place(${String(me?.id)}, 500, 300, 0); window.__TTE__.arena.place(${String(foe?.id)}, 660, 300, 0); window.__TTE__.arena.step(1)`);
  const hp = async (): Promise<number> => (await page.evaluate<{ id: number; hp: number }[]>('window.__TTE__.arena.characters()')).find((c) => c.id === foe?.id)?.hp ?? 0;
  const start = await hp();
  const out = (n: string): string => (shotDir ? `${shotDir}/${hero}-${n}.png` : info.outputPath(`${n}.png`));
  let landed = false;
  for (let i = 0; i < 40 && !landed; i++) {
    await page.evaluate('window.__TTE__.arena.step(1, [32, 0])');
    landed = (await hp()) < start;
  }
  expect(landed).toBe(true);
  let t = 0;
  for (const a of AFTER) {
    while (t < a) {
      await page.evaluate('window.__TTE__.arena.step(1)');
      t++;
    }
    await raf(page);
    await page.screenshot({ path: out(`hit-t${String(a).padStart(2, '0')}`) });
  }
  expect(errors).toEqual([]);
});
