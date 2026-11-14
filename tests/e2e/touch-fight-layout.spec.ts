import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START } from './parity/helpers';

// Touch fight screen: the first-run card, the stick and the arena on phone viewports. Shots go to $SHOT_DIR when set (before/after review).
const shotDir = process.env['SHOT_DIR'];

async function enterFight(page: Page, team = 1): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  if (team === 2) {
    await page.getByLabel('Team').selectOption('2');
    await page.getByLabel('Your race').selectOption('sindarosa');
    await page.getByLabel('Your partner (2v2)').selectOption('pax');
    await page.getByLabel('AI race').selectOption('fiara');
  }
  await page.getByRole('button', { name: /^Fight/ }).tap();
  await page.waitForFunction(ARENA_READY);
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Page-space box of a selector (DOM only, so it holds for any canvas resolution). */
const box = (page: Page, sel: string): Promise<Box> =>
  page.evaluate<Box>(`(() => {
    const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function shot(page: Page, name: string): Promise<void> {
  if (shotDir) await page.screenshot({ path: `${shotDir}/${name}.png` });
}

test.describe('phone landscape fight', () => {
  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('card clears the stick and the action bar; Got it is tappable', async ({ page }) => {
    await enterFight(page);
    await shot(page, 'land-card');
    const card = await box(page, '#firstRunHint');
    const stick = await box(page, '#touchStick');
    expect(overlap(card, stick)).toBe(false);
    expect(card.y + card.h).toBeLessThan(390 * 0.8); // above the TAG caption and the action bar
    await page.getByRole('button', { name: 'Got it' }).tap();
    await expect(page.locator('#firstRunHint')).toHaveCount(0);
    await shot(page, 'land-clear');
    await page.evaluate(`window.__TTE__.arena.step(120)`);
    await shot(page, 'land-hud');
  });
  test('2v2 card', async ({ page }) => {
    await enterFight(page, 2);
    await shot(page, 'land-2v2-card');
  });
});

test.describe('phone portrait fight', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('portrait: card sits under the canvas, clear of the stick', async ({ page }) => {
    await enterFight(page);
    await shot(page, 'port-rotate');
    await page.getByRole('button', { name: 'Play in portrait anyway' }).tap();
    await shot(page, 'port-play');
    const card = await box(page, '#firstRunHint');
    const stick = await box(page, '#touchStick');
    const canvas = await box(page, 'canvas');
    expect(overlap(card, stick)).toBe(false);
    expect(card.y).toBeGreaterThanOrEqual(canvas.y + canvas.h);
    await page.getByRole('button', { name: 'Got it' }).tap();
    await expect(page.locator('#firstRunHint')).toHaveCount(0);
    await shot(page, 'port-clear');
  });
  test('portrait 2v2', async ({ page }) => {
    await enterFight(page, 2);
    await shot(page, 'port-2v2-rotate');
  });
});
