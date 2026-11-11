import { expect, test } from '@playwright/test';
import { collectErrors, fixture, seedViaGameMaster, startBattle } from './parity/helpers';

const DOWN = 1 << 1;
const BAR_Y = 640; // the action bar's top edge in the 720-high arena

test('a real Classic battle: the hero cannot walk down behind the action bar (C28 walkAboveActionBar)', async ({ page }) => {
  const errors = collectErrors(page);
  await seedViaGameMaster(page, fixture('v0-ch4'));
  await startBattle(page, 'enterPracticeContainer', 1);
  await page.evaluate(`window.__TTE__.arena.step(400, [${String(DOWN)}, 0])`);
  const bottom = await page.evaluate<number>(`(() => { const c = window.__TTE__.arena.characters().find((x) => x.team === 0); return c.y + 80; })()`);
  expect(bottom).toBeLessThanOrEqual(BAR_Y);
  expect(bottom).toBeGreaterThan(BAR_Y - 40); // it really walked down to the limit
  expect(errors).toEqual([]);
});
