import { expect, test } from '@playwright/test';

const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`;
const CANVAS_WIDTH = `document.querySelector('#game canvas').getBoundingClientRect().width`;
/** Canvas centre minus the window centre, in CSS px: (0, 0) when the letterbox bands split evenly (VISUAL-QA V1). */
const CENTRE_OFFSET = `(() => { const r = document.querySelector('#game canvas').getBoundingClientRect(); return [r.x + r.width / 2 - window.innerWidth / 2, r.y + r.height / 2 - window.innerHeight / 2]; })()`;

async function chooseSize(page: import('@playwright/test').Page, label: string): Promise<void> {
  await page.goto('/#settings');
  await page.getByLabel(label, { exact: false }).first().check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // Saving is asynchronous (IndexedDB); the screen navigates to #main only after the store has persisted.
  await page.waitForFunction(`window.location.hash === '#main'`);
}

async function arenaWidthAndHash(page: import('@playwright/test').Page): Promise<[number, number]> {
  await page.goto('/?ff=arenaDemo&manual=1');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  // Every display size centres the canvas in the window, vertically too (no canvas pinned to the top).
  const [dx, dy] = await page.evaluate<[number, number]>(CENTRE_OFFSET);
  expect(Math.abs(dx)).toBeLessThanOrEqual(1);
  expect(Math.abs(dy)).toBeLessThanOrEqual(1);
  await page.evaluate(`window.__TTE__.arena.step(50, [0, 0])`);
  const hash = await page.evaluate<number>(`window.__TTE__.arena.hash()`);
  return [await page.evaluate<number>(CANVAS_WIDTH), hash];
}

test('display size changes the canvas CSS size but not the sim state hash; the canvas stays centred', async ({ page }) => {
  await chooseSize(page, 'Smallest');
  const [smallW, smallHash] = await arenaWidthAndHash(page);
  await chooseSize(page, 'Largest');
  const [largeW, largeHash] = await arenaWidthAndHash(page);
  expect(smallW).toBeLessThan(largeW);
  expect(smallHash).toBe(largeHash);
});
