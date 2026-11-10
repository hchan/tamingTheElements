import { expect, test } from '@playwright/test';

const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`;
const CANVAS_WIDTH = `document.querySelector('#game canvas').getBoundingClientRect().width`;

async function chooseSize(page: import('@playwright/test').Page, label: string): Promise<void> {
  await page.goto('/#settings');
  await page.getByLabel(label, { exact: false }).first().check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

async function arenaWidthAndHash(page: import('@playwright/test').Page): Promise<[number, number]> {
  await page.goto('/?ff=arenaDemo&manual=1');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(50, [0, 0])`);
  const hash = await page.evaluate<number>(`window.__TTE__.arena.hash()`);
  return [await page.evaluate<number>(CANVAS_WIDTH), hash];
}

test('display size changes the canvas CSS size but not the sim state hash', async ({ page }) => {
  await chooseSize(page, 'Smallest');
  const [smallW, smallHash] = await arenaWidthAndHash(page);
  await chooseSize(page, 'Largest');
  const [largeW, largeHash] = await arenaWidthAndHash(page);
  expect(smallW).toBeLessThan(largeW);
  expect(smallHash).toBe(largeHash);
});
