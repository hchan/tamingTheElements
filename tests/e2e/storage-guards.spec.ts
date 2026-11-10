import { expect, test } from '@playwright/test';
import { fixture, goToHash, seedViaGameMaster } from './parity/helpers';

const CORRUPT_LIVE_RECORD = `new Promise((resolve, reject) => {
  const open = indexedDB.open('tte');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const tx = db.transaction('saves', 'readwrite');
    tx.objectStore('saves').put({ schemaVersion: 1, chapter: 'garbage' }, 'main');
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => reject(tx.error);
  };
})`;

test('a corrupt live save is restored from the newest backup with a visible notice', async ({ page }) => {
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.evaluate(CORRUPT_LIVE_RECORD);
  await page.goto('/?seed=7');
  await goToHash(page, '#settings');
  await expect(page.locator('#storeNotice')).toBeVisible();
  await expect(page.locator('#storeNotice')).toContainText('backup was restored');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await page.locator('#storeNotice button').click();
  await expect(page.locator('#storeNotice')).toBeHidden();
});

test('saving in one tab warns the other tab', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await seedViaGameMaster(a, fixture('v0-ch3'));
  await b.goto('/?seed=7');
  await b.waitForFunction(`window.__TTE__ && window.__TTE__.ready`);
  // Tab A saves again through the store (game master writes via the SaveStore).
  await seedViaGameMaster(a, fixture('v0-ch2'));
  await expect(b.locator('#storeNotice')).toContainText('another tab');
  await expect(a.locator('#storeNotice')).toBeHidden();
});
