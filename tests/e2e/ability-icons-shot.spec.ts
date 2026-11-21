import { test } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';
import { waitForArena } from './support/wait';

// Long gate (per-hero visual, a few seconds each, not @smoke): the action bar of heroes whose ability slots wear an approved AI icon
// (Kindrel: Ember Bite; Quarrak: Hurl Rock; Glimmaw: Lure Orb; Vortigal: Talon Rake) behind ?ff=roster24. The bar crops are attached to
// the report (test-results), so a run on the PC returns them. Never needed to pass beyond a clean console.
for (const race of ['kindrel', 'quarrak', 'glimmaw', 'vortigal']) {
  test(`${race} action bar shot`, async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade,roster24#arcade`);
    await page.getByLabel('Your race').selectOption(race);
    await page.getByLabel('AI race').selectOption('fiara');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await waitForArena(page);
    const card = page.getByRole('button', { name: 'Got it' });
    if (await card.isVisible()) await card.click();
    await page.evaluate(`window.__TTE__.arena.step(120)`);
    await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    await info.attach(`${race}-bar`, { body: await page.screenshot(), contentType: 'image/png' });
    if (errors.length > 0) throw new Error(errors.join('\n'));
  });
}
