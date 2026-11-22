import { expect, test } from '@playwright/test';
import { START } from './parity/helpers';

// World Tour tile names are 16 px (a11y review #3) and no name is clipped. Screenshots go to .scratch/tour-tiles/.
const SHOT_DIR = process.env.TT_SHOT_DIR ?? '.scratch/tour-tiles';

for (const [name, width, height] of [
  ['1280x720', 1280, 720],
  ['1920x1080', 1920, 1080],
] as const) {
  test(`tour tile names are 16 px and not clipped at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`${START}&ff=arcade#tour`);
    await expect(page.locator('#tourPick .heroTile').first()).toBeVisible();
    const rows = await page.evaluate<Array<{ text: string; size: number; clipped: boolean }>>(
      `[...document.querySelectorAll('#tourPick .heroTileName')].filter(e => e.getClientRects().length).map(e => ({ text: e.textContent, size: parseFloat(getComputedStyle(e).fontSize), clipped: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 || e.getBoundingClientRect().right > e.closest('.heroTile').getBoundingClientRect().right + 1 }))`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.size, r.text).toBeGreaterThanOrEqual(16);
      expect(r.clipped, r.text).toBe(false);
    }
    await page.screenshot({ path: `${SHOT_DIR}/page-${name}.png` });
  });
}
