import { expect, test } from '@playwright/test';
import { fixture, goToHash, seedViaGameMaster } from './parity/helpers';

test('the objectives heading exists when the router focuses it', async ({ page }) => {
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto('/?seed=7');
  await goToHash(page, '#currentObjectives');
  await expect(page.getByRole('heading', { level: 1, name: 'Chapter 3 Objectives' })).toBeFocused();
});
