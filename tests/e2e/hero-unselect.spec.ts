import { expect, test, type Page } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';

// Unselecting heroes on the Play team picker: the x button, a second click on the tile, Delete; Start waits for a full team.
const SELECTS = ['Hero 1 (lead)', 'Hero 2', 'Hero 3'] as const;
const team = async (page: Page): Promise<string[]> => Promise.all(SELECTS.map((l) => page.getByLabel(l, { exact: true }).inputValue()));

test('Play picker: remove a hero three ways, Start waits for three heroes', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#tour`);
  await page.getByLabel('Hero 1 (lead)').selectOption('fiara');
  await page.getByLabel('Hero 2').selectOption('rokcore');
  await page.getByLabel('Hero 3').selectOption('curomo');
  const start = page.locator('#tourStart');
  await expect(page.locator('.heroSlotClear')).toHaveCount(3);
  await expect(start).toBeEnabled();

  // The x button.
  await page.getByRole('button', { name: 'Remove Rokcore from slot 2' }).click();
  expect(await team(page)).toEqual(['fiara', '', 'curomo']);
  await expect(page.locator('#tourSlot2')).toContainText('Empty');
  await expect(start).toBeDisabled();
  await expect(page.locator('#tourHint')).toHaveText('Pick 1 more hero');
  await expect(page.getByRole('status')).toContainText('Rokcore removed from hero 2.');

  // Refill, then a second click on the picked tile takes it off again.
  await page.locator('.heroTile').filter({ hasText: /^Rokcore/ }).click();
  await page.getByRole('button', { name: 'Add to team' }).click();
  expect(await team(page)).toEqual(['fiara', 'rokcore', 'curomo']);
  await page.locator('.heroTile').filter({ hasText: /^Curomo/ }).click();
  await page.locator('.heroTile').filter({ hasText: /^Curomo/ }).click();
  expect(await team(page)).toEqual(['fiara', 'rokcore', '']);

  // Delete on a focused slot.
  await page.locator('#tourSlot1').focus();
  await page.keyboard.press('Delete');
  expect(await team(page)).toEqual(['', 'rokcore', '']);
  await expect(page.locator('#tourHint')).toHaveText('Pick 2 more heroes');
  await expect(start).toBeDisabled();
  expect(errors).toEqual([]);
});

// Layout and state fixes from the owner's "adding/removing is buggy" screenshot.
for (const vp of [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }, { w: 800, h: 450 }]) {
  test(`Play picker ${String(vp.w)}x${String(vp.h)}: x sits inside its slot, the Slot badge never covers a name, focus and the lead slot survive removal`, async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto(`${START}&ff=arcade#tour`);
    await page.getByLabel('Hero 1 (lead)').selectOption('fiara');
    await page.getByLabel('Hero 2').selectOption('curomo');
    await page.getByLabel('Hero 3').selectOption('rokcore');
    expect(
      await page.evaluate<boolean[]>(
        `Array.from(document.querySelectorAll('.heroSlots li'), (li) => { const x = li.querySelector('.heroSlotClear'); const r = li.getBoundingClientRect(); if (!x) return true; const q = x.getBoundingClientRect(); return q.left >= r.left && q.right <= r.right && q.top >= r.top && q.bottom <= r.bottom; })`,
      ),
    ).toEqual([true, true, true]);
    expect(
      await page.evaluate<boolean[]>(
        `Array.from(document.querySelectorAll('.heroTile.heroPicked'), (t) => { const f = t.querySelector('.heroFlag'); const n = t.querySelector('.heroTileName'); if (!f || !n) return false; const a = f.getBoundingClientRect(); const b = n.getBoundingClientRect(); return a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom; })`,
      ),
    ).toEqual([true, true, true]);
    await page.screenshot({ path: info.outputPath(`play-${String(vp.w)}.png`) });
    // x by keyboard: focus lands on the slot, not the page body.
    await page.getByRole('button', { name: 'Remove Fiara from slot 1' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#tourSlot1')).toBeFocused();
    await expect(page.locator('#tourSlot1')).toContainText('Hero 1 (lead)');
    // Empty the team: the next hero goes to the lead slot, not slot 3.
    await page.getByRole('button', { name: /^Remove .* from slot 2/ }).click();
    await page.getByRole('button', { name: /^Remove .* from slot 3/ }).click();
    await page.locator('.heroTile').filter({ hasText: /^Pax/ }).dblclick();
    expect(await team(page)).toEqual(['pax', '', '']);
    // The panel button names what it does.
    await page.locator('.heroTile').filter({ hasText: /^Pax/ }).click();
    await expect(page.locator('.heroAdd')).toHaveText('Swap into hero 2');
    await page.locator('.heroTile').filter({ hasText: /^Fiara/ }).click();
    await expect(page.locator('.heroAdd')).toHaveText('Add to team');
    expect(errors).toEqual([]);
  });
}
