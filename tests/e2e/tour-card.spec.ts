import { expect, test } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';

// Tour stage card scannability: four short Label: value rows, no filler sentence, a Fight button of at least 44 px, no banned words,
// and the whole card from title through Fight inside a 667x375 phone landscape viewport. SHOT_DIR (optional) saves screenshots.
for (const [name, width, height] of [['desktop', 1280, 720], ['phone', 667, 375]] as const) {
  test(`Tour stage card is scannable at ${name} ${String(width)}x${String(height)}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width, height });
    await page.goto(`${START}&ff=arcade#tour`);
    await page.getByLabel('Hero 1 (lead)').selectOption('fiara');
    await page.getByLabel('Hero 2').selectOption('rokcore');
    await page.getByLabel('Hero 3').selectOption('curomo');
    await page.getByRole('button', { name: 'Start tour' }).click();
    const card = page.locator('#tourStage');
    await expect(card.locator('.tourFact')).toHaveCount(4);
    await expect(card.locator('.tsPanel')).toBeVisible();
    await expect(card).not.toContainText('Press Fight');
    const text = (await card.textContent()) ?? '';
    expect(text).not.toMatch(/classic|arcade|ruleset|capture/i);
    const fight = await page.locator('#tourFight').boundingBox();
    expect(fight?.height).toBeGreaterThanOrEqual(44);
    expect((fight?.y ?? 0) + (fight?.height ?? 0)).toBeLessThanOrEqual(height);
    const dir = process.env['SHOT_DIR'];
    if (dir) await page.screenshot({ path: `${dir}/tour-card-${name}.png` });
    expect(errors).toEqual([]);
  });
}
