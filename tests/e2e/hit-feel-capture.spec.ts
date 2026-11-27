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
  // Start $GAP px apart (default 160: inside melee reach, clear of overlap); when no hit lands within 20 steps, close in (some
  // heroes are shorter or have less reach, e.g. pax vs lavax) and try again.
  const hp = async (): Promise<number> => (await page.evaluate<{ id: number; hp: number }[]>('window.__TTE__.arena.characters()')).find((c) => c.id === foe?.id)?.hp ?? 0;
  const out = (n: string): string => (shotDir ? `${shotDir}/${hero}-${n}.png` : info.outputPath(`${n}.png`));
  const gaps = [Number(process.env['GAP'] ?? 160), 120, 90, 70, 55].filter((g, i, all) => Number.isFinite(g) && all.indexOf(g) === i);
  let landed = false;
  for (const gap of gaps) {
    await page.evaluate(`window.__TTE__.arena.place(${String(me?.id)}, 500, 300, 0); window.__TTE__.arena.place(${String(foe?.id)}, ${String(500 + gap)}, 300, 0); window.__TTE__.arena.step(1)`);
    const start = await hp();
    for (const cmd of [32, 16]) {
      for (let i = 0; i < 30 && !landed; i++) {
        await page.evaluate(`window.__TTE__.arena.step(1, [${String(cmd)}, 0])`);
        landed = (await hp()) < start;
      }
      if (landed) break;
    }
    if (landed) break;
  }
  expect(landed).toBe(true);
  const xs = async (): Promise<{ me: number; foe: number }> => {
    const cs = await page.evaluate<{ id: number; x: number }[]>('window.__TTE__.arena.characters()');
    return { me: cs.find((c) => c.id === me?.id)?.x ?? NaN, foe: cs.find((c) => c.id === foe?.id)?.x ?? NaN };
  };
  const trace = [await xs()];
  let t = 0;
  for (const a of AFTER) {
    while (t < a) {
      await page.evaluate('window.__TTE__.arena.step(1)');
      trace.push(await xs());
      t++;
    }
    await raf(page);
    await page.screenshot({ path: out(`hit-t${String(a).padStart(2, '0')}`) });
  }
  // Displacement over the sequence (a regression in recoil or hit-stop would flatten or jitter it): the defender is pushed away
  // from the attacker, never back toward it, and ends clearly displaced; the attacker is not dragged along.
  const first = trace[0];
  const last = trace[trace.length - 1];
  expect(first && last).toBeTruthy();
  const pushed = (last?.foe ?? 0) - (first?.foe ?? 0);
  expect(pushed, 'defender recoils away from the attacker over 16 ticks').toBeGreaterThanOrEqual(10);
  for (let i = 1; i < trace.length; i++) {
    expect(trace[i]?.foe ?? NaN, `defender x never moves back toward the attacker at tick ${String(i)}`).toBeGreaterThanOrEqual(trace[i - 1]?.foe ?? Infinity);
  }
  expect(Math.abs((last?.me ?? NaN) - (first?.me ?? 0)), 'attacker is not dragged by the hit').toBeLessThanOrEqual(40);
  expect(errors).toEqual([]);
});
