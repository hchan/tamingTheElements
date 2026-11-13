import { expect, test } from '@playwright/test';
import { collectErrors, fixture, seedViaGameMaster, waitForRoute } from './parity/helpers';

test('Key Bindings: the stick deadzone slider is saved and survives a reload (gamepad stubbed)', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.addInitScript(`
    navigator.getGamepads = () => [{ connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }];
  `);
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto('/?seed=7');
  await page.getByRole('heading', { level: 1, name: 'Taming the Elements' }).waitFor();
  await page.evaluate(`window.location.hash = '#keyBindings'`);
  await waitForRoute(page, '#keyBindings');
  const slider = page.getByRole('slider', { name: /Stick deadzone/ });
  await expect(slider).toBeVisible();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '50 percent');
  expect(await page.evaluate(`localStorage.getItem('tte.padDeadzone')`)).toBe('0.5');
  await slider.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('pad-deadzone.png') });
  await page.reload();
  await page.evaluate(`window.location.hash = '#keyBindings'`);
  await waitForRoute(page, '#keyBindings');
  await expect(page.getByRole('slider', { name: /Stick deadzone/ })).toHaveAttribute('aria-valuetext', '50 percent');
  await page.getByRole('button', { name: 'Reset stick deadzone' }).click();
  await expect(page.getByRole('slider', { name: /Stick deadzone/ })).toHaveAttribute('aria-valuetext', '40 percent');
  expect(await page.locator('#menu').innerText()).not.toMatch(/classic|arcade|ruleset|capture/i);
  expect(errors).toEqual([]);
});
