import { expect, test } from '@playwright/test';
import { START } from './parity/helpers';

// QA r26: on a phone in landscape (844x390) the main menu is ONE row of five centred buttons (it was a 2-column grid read in a zigzag).
test('phone landscape menu is a single row, left to right, with centred labels', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(START);
  const buttons = page.locator('.mainMenuList li button');
  await expect(buttons).toHaveCount(5);
  const boxes = [];
  for (let i = 0; i < 5; i++) boxes.push(await buttons.nth(i).boundingBox());
  expect(new Set(boxes.map((b) => Math.round(b?.y ?? -1))).size).toBe(1);
  for (let i = 1; i < boxes.length; i++) expect(boxes[i]?.x ?? 0).toBeGreaterThan(boxes[i - 1]?.x ?? 0);
  await expect(buttons.first()).toHaveCSS('text-align', 'center');
});
