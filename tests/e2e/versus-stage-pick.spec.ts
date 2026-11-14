import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Versus Arena choice: the picked element is the stage the match opens on (the match seed is steered; the sim has no stage setting).
const CASES: ReadonlyArray<readonly [string, number]> = [['Fire', 1], ['Water', 2], ['Earth', 3], ['Air', 4]];

for (const [label, stage] of CASES) {
  test(`Versus Arena ${label} opens the match on that stage`, async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#arcade`);
    await expect(page.getByRole('radio', { name: /^✓?Random$/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('radio', { name: new RegExp(`^✓?${label}$`) }).click();
    await expect(page.getByRole('radio', { name: new RegExp(`^✓?${label}$`) })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate('window.__TTE__.arena.step(95, [0, 0])');
    const t = await page.evaluate<{ stage: number } | undefined>('window.__TTE__.arena.terrain()');
    expect(t?.stage).toBe(stage);
    await page.locator('#game canvas').screenshot({ path: info.outputPath(`stage-${label}.png`) });
    expect(errors).toEqual([]);
  });
}

test('Versus Arena is operable by keyboard', async ({ page }) => {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('radio', { name: /^✓?Random$/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: /^✓?Fire$/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: /^✓?Water$/ })).toHaveAttribute('aria-checked', 'true');
});
