import { expect, test } from '@playwright/test';
import { START } from './parity/helpers';

// Team stack text (.tsRole/.tsStats/.tsTag/.tsRemove) is >= 14 px at desktop sizes and the stack does not overflow.
// Page-side code is passed as strings (no DOM lib in tsconfig.node). Screenshots go to .scratch/teamstack-text/.
const SHOT_DIR = process.env.TS_SHOT_DIR ?? '.scratch/teamstack-text';

for (const [name, width, height] of [
  ['1280x720', 1280, 720],
  ['1920x1080', 1920, 1080],
] as const) {
  test(`team stack text is >= 14 px and inside the stack at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`${START}&ff=arcade#tour`);
    await expect(page.locator('#tourPick .teamStack').first()).toBeVisible();
    await page.locator('#tourPick .heroTile').first().click();
    const rows = await page.evaluate<Array<{ sel: string; size: number }>>(
      `(() => { const out = []; for (const sel of ['.tsRole', '.tsStats', '.tsTag', '.tsRemove']) { for (const e of document.querySelectorAll('#tourPick .teamStack ' + sel)) { if (e.getClientRects().length) out.push({ sel, size: parseFloat(getComputedStyle(e).fontSize) }); } } return out; })()`,
    );
    expect(rows.some((r) => r.sel === '.tsRole')).toBe(true);
    for (const r of rows) expect(r.size, r.sel).toBeGreaterThanOrEqual(14);
    const overflow = await page.evaluate<boolean>(
      `[...document.querySelectorAll('#tourPick .teamStack')].some(s => s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 1)`,
    );
    expect(overflow).toBe(false);
    await page.locator('#tourPick .teamStack').first().screenshot({ path: `${SHOT_DIR}/stack-${name}.png` });
    await page.screenshot({ path: `${SHOT_DIR}/page-${name}.png` });
  });
}
