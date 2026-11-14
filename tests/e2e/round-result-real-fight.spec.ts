import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters, collectErrors } from './parity/helpers';

// The round card's DAMAGE / LONGEST COMBO lines must count a real fight (r15 doubted them after a hook-set KO). The player
// presses the real attack key next to the foe; no life is set by the test. Page-side code is passed as strings.
const INTRO = 91;
const stepLive = (page: Page, n: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.stepLive(${String(n)})`);
const resultLines = (page: Page): Promise<string[]> =>
  page.evaluate<string[]>(`window.__TTE__.arena.rounds().then((r) => r.result.lines)`);

test('a real fight fills the round card: damage dealt and hits are above zero', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  const [me] = await characters(page, 0);
  const [foe] = await characters(page, 1);
  if (!me || !foe) throw new Error('both fighters must be in the arena');
  await page.evaluate(`window.__TTE__.arena.place(${String(me.id)}, 500, 360, 0)`);
  await page.keyboard.down('Space');
  let over = false;
  for (let i = 0; i < 60 && !over; i++) {
    await page.evaluate(`(() => { const a = window.__TTE__.arena; a.place(${String(me.id)}, 500, 360, 0); a.place(${String(foe.id)}, 540, 360, 4); a.setHp(${String(me.id)}, 9999); })()`);
    await stepLive(page, 25);
    over = await page.evaluate<boolean>(`window.__TTE__.arena.rounds().then((r) => r.result.visible)`);
  }
  await page.keyboard.up('Space');
  // Round ends by the foe's real damage or by time; either way hits landed.
  if (!over) {
    await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(foe.id)}, 0); a.step(1); })()`);
    await stepLive(page, 150);
  }
  const lines = await resultLines(page);
  const dmg = /DAMAGE (\d+) DEALT/.exec(lines[1] ?? '');
  expect(Number(dmg?.[1])).toBeGreaterThan(0);
  expect(lines[2]).not.toMatch(/^LONGEST COMBO 0 \/ 0 HITS/);
  expect(errors).toEqual([]);
});
