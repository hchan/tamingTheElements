import { expect, test } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';

// The Versus hero slot cards summarise the picked hero's abilities as text (name and kind word), readable to screen readers.
test('a picked hero slot card lists its abilities as text', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Team').selectOption('1');
  await page.getByLabel('Your race').selectOption('fiara');
  const slot = page.locator('#arcadePick .rosterSlot').filter({ hasText: 'Fiara' }).first();
  await expect(slot.locator('.vsAbility')).toHaveText([/Fire Heal \(Heal\)/, /Fireball \(Ranged\)/]);
  await expect(slot).toHaveAccessibleName(/Fire Heal \(Heal\)/);
  await expect(slot.locator('.vsAbilities')).toHaveAttribute('title', 'Abilities: Fire Heal, heal; Fireball, ranged.');
  await expect(page.locator('#arcadePick')).not.toContainText(/capture|classic|ruleset/i);
  await page.screenshot({ path: info.outputPath('versus-abilities.png') });
  expect(errors).toEqual([]);
});
