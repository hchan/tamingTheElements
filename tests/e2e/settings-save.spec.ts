import { expect, test, type Page } from '@playwright/test';
import { collectErrors, fixture, goToHash, SAVE_KEY, seedViaGameMaster, storedSave } from './parity/helpers';

async function saveSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(`window.__TTE__.state().mountedRoute === '#main'`);
}

test('a stale localStorage mirror does not wipe the IndexedDB save when settings are saved', async ({ page }) => {
  const errors = collectErrors(page);
  const seed = fixture('v0-ch3');
  await seedViaGameMaster(page, seed);
  // First store load copies the mirror into IndexedDB.
  await goToHash(page, '#settings');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  // Now make the mirror invalid: IndexedDB still holds the real progress.
  await page.evaluate(`window.localStorage.setItem(${JSON.stringify(SAVE_KEY)}, '{not json')`);
  await page.reload();
  await page.getByLabel('Reduce motion').check();
  await saveSettings(page);
  const after = await storedSave(page);
  expect(after.garrison.length).toBe(seed.garrison.length);
  expect(after.chapter).toBe(3);
  expect(after).toMatchObject({ reduceMotion: true });
  expect(errors).toEqual([]);
});

test('importing a save and then saving settings keeps the imported data', async ({ page }) => {
  await seedViaGameMaster(page, fixture('v0-ch2'));
  await goToHash(page, '#settings');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  const cur = await storedSave(page);
  const imported = JSON.stringify({
    format: 'tte-save',
    schemaVersion: 1,
    savedAt: 1,
    data: { ...cur, chapter: 4 },
  });
  page.once('dialog', (d) => void d.accept());
  await page.locator('input[type=file]').setInputFiles({
    name: 'save.json',
    mimeType: 'application/json',
    buffer: Buffer.from(imported),
  });
  await expect(page.getByRole('status').filter({ hasText: 'Save imported.' })).toBeVisible();
  await page.getByLabel('High contrast').check();
  await saveSettings(page);
  const after = await storedSave(page);
  expect(after.chapter).toBe(4);
  expect(after).toMatchObject({ highContrast: true });
});

test('importing a save with an unknown character shows a friendly error and keeps the current save', async ({ page }) => {
  await seedViaGameMaster(page, fixture('v0-ch2'));
  await goToHash(page, '#settings');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  const cur = await storedSave(page);
  const bad = { ...cur, garrison: [{ id: 'x', characterName: 'Bogus Mage', experience: 1 }], displaySettings: 9999 };
  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await expect(page.locator('.settingsTransfer .settingsStatus')).toContainText('The save file is invalid');
  expect((await storedSave(page)).chapter).toBe(2);
});
