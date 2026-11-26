import { expect, test, type Page } from '@playwright/test';
import { START, characters, collectErrors } from './parity/helpers';
import { waitForArena } from './support/wait';
import { TAG_IN_BODY_PX, tagEntryDrop } from '../../src/game/views/tag-entry';

// qa-r125 left wall: a tag-in next to the left wall with the foe in contact drops in from above, high enough to clear the foe's sprite.
// The swap frame is attached to the result as a screenshot (test-results/ of the run).
const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

test('tag-in at the left wall with the foe in contact enters from above', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Team').selectOption('2');
  await page.getByLabel('Your race').selectOption('fiara');
  await page.getByLabel('Your partner (2v2)').selectOption('pax');
  await page.getByLabel('AI race').selectOption('sindarosa');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitForArena(page);
  await page.evaluate(`window.__TTE__.arena.step(91)`);
  const [lead] = await characters(page, 0);
  const [foe] = await characters(page, 1);
  await page.evaluate(`window.__TTE__.arena.place(${String(lead?.id)}, 80, 380, 1)`);
  await page.evaluate(`window.__TTE__.arena.place(${String(foe?.id)}, 180, 380, -1)`);
  await page.keyboard.down('Digit3');
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.keyboard.up('Digit3');
  await frames(page);
  await testInfo.attach('tag-left-wall', { body: await page.screenshot(), contentType: 'image/png' });
  // The wall entry starts a full body height above rest, so the incoming sprite clears the foe's sprite instead of overlapping the wall side.
  expect(tagEntryDrop(0)).toBeGreaterThanOrEqual(TAG_IN_BODY_PX);
  expect((await characters(page, 0))[0]?.id).not.toBe(lead?.id);
  expect(errors).toEqual([]);
});
