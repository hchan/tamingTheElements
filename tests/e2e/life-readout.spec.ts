import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Rokcore life readout: the HUD names absolute life ("Life 365/365") beside each bar, so a giant's smaller pool is readable, not guessed.
const INTRO = 91;

test('Rokcore 365 and Pax 795 are written as words and numbers beside the bars', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('rokcore');
  await page.getByLabel('AI race').selectOption('pax');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const labels = await page.evaluate<string[]>(`window.__TTE__.arena.heroLabels()`);
  expect(labels[0]).toContain('Life 365/365');
  expect(labels[1]).toContain('Life 795/795');
  expect((await page.locator('#game canvas').screenshot({ path: info.outputPath('life-readout.png') })).length).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});
