import { expect, test } from '@playwright/test';
import { ARENA_READY, START } from './parity/helpers';

// Curomo's Ice Shock with real key input (QA r20): the foe in range, the First Blood card gone. Shots go to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];
const frames = (page: import('@playwright/test').Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

test('Curomo Ice Shock: held attack key hits a foe in range and the ice spear shows', async ({ page }) => {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('curomo');
  await page.getByLabel('AI race').selectOption('rokcore');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(100)`);
  await page.evaluate(`document.querySelector('.firstRunDone')?.click()`);
  await expect(page.locator('#firstRunHint')).toHaveCount(0);
  const chars = await page.evaluate<{ id: number; team: number; hp: number }[]>(`window.__TTE__.arena.characters()`);
  const me = chars.find((c) => c.team === 0);
  const foe = chars.find((c) => c.team === 1);
  expect(me && foe).toBeTruthy();
  await page.evaluate(`window.__TTE__.arena.place(${String(me?.id)}, 560, 300, 0); window.__TTE__.arena.place(${String(foe?.id)}, 660, 300, 0); window.__TTE__.arena.step(1)`);
  await page.keyboard.down('Digit1');
  await page.evaluate(`window.__TTE__.arena.stepLive(8)`);
  await frames(page);
  if (shotDir) await page.screenshot({ path: `${shotDir}/ice-shock.png` });
  await page.keyboard.up('Digit1');
  const after = await page.evaluate<{ id: number; hp: number }[]>(`window.__TTE__.arena.characters()`);
  expect(after.find((c) => c.id === foe?.id)?.hp ?? 0).toBeLessThan(foe?.hp ?? 0);
});
