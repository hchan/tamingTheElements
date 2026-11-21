import { expect, test, type Page } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';

// World Tour picker on the shared MvC team stack: a pick locks the next empty slot, a click on a filled row or Delete removes it,
// Q pops the last pick; Start waits for three heroes. Hidden selects keep the form data.
const SELECTS = ['Hero 1 (lead)', 'Hero 2', 'Hero 3'] as const;
const team = async (page: Page): Promise<string[]> => Promise.all(SELECTS.map((l) => page.getByLabel(l, { exact: true }).inputValue()));
const tile = (page: Page, name: RegExp) => page.locator('#tourPick .heroTile').filter({ hasText: name });

test('World Tour picker: remove a hero by its row or Delete, Start waits for three heroes', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#tour`);
  const start = page.locator('#tourStart');
  const rows = page.locator('#tourPick .tsRow');
  await expect(rows).toHaveCount(3);
  // Clear the suggested team, then pick three by click.
  for (const n of [/^Fiara/, /^Rokcore/, /^Curomo/]) await tile(page, n).click();
  expect(await team(page)).toEqual(['fiara', 'rokcore', 'curomo']);
  await expect(start).toBeEnabled();
  await expect(page.locator('#tourPick .tsRow[title^="Remove "]')).toHaveCount(3);

  // A click on a filled row removes it; the stack closes the gap.
  await page.locator('#tourSlot2[title^="Remove Rokcore from slot 2"]').click();
  expect(await team(page)).toEqual(['fiara', 'curomo', '']);
  await expect(page.locator('#tourSlot3')).toContainText('Empty');
  await expect(start).toBeDisabled();
  await expect(page.locator('#tourHint')).toHaveText('Pick 1 more hero');
  await expect(page.getByRole('status')).toContainText('Rokcore removed from slot 2.');

  // Refill by one pick, then Delete on a focused row.
  await tile(page, /^Rokcore/).click();
  expect(await team(page)).toEqual(['fiara', 'curomo', 'rokcore']);
  await expect(start).toBeEnabled();
  await page.locator('#tourSlot1').focus();
  await page.keyboard.press('Delete');
  expect(await team(page)).toEqual(['curomo', 'rokcore', '']);
  await expect(page.locator('#tourHint')).toHaveText('Pick 1 more hero');
  await expect(start).toBeDisabled();
  expect(errors).toEqual([]);
});

// Long gate: a keyboard sequence on the tour picker (same pattern as the Versus 3v3 spec).
test('World Tour 3v3: Space locks three heroes in order, Q pops the last, Space on a full team starts the tour', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#tour`);
  const rows = page.locator('#tourPick .tsRow');
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('KeyD');
    await page.keyboard.press('Space');
  }
  await expect(rows.nth(2)).toHaveAttribute('title', /^Remove /);
  await expect(page.locator('#tourStart')).toBeEnabled();
  await page.keyboard.press('KeyQ');
  await expect(rows.nth(2)).not.toHaveAttribute('title', /^Remove /);
  await expect(page.locator('#tourStart')).toBeDisabled();
  await page.keyboard.press('KeyD');
  await page.keyboard.press('Space');
  await expect(rows.nth(2)).toHaveAttribute('title', /^Remove /);
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'Stage 1 of 9' })).toBeVisible();
  expect(errors).toEqual([]);
});

// qa-r46 and layout: the stack rows stay inside the stack and no tile name is clipped.
for (const vp of [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }]) {
  test(`World Tour picker ${String(vp.w)}x${String(vp.h)}: tile names are not clipped and the rows sit inside the stack`, async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto(`${START}&ff=arcade#tour`);
    await expect(page.locator('#tourPick .tsRow')).toHaveCount(3);
    expect(
      await page.evaluate<string[]>(
        `Array.from(document.querySelectorAll('#tourPick .heroTileName'), (n) => n.scrollWidth > n.clientWidth + 1 ? n.textContent : '').filter(Boolean)`,
      ),
    ).toEqual([]);
    expect(
      await page.evaluate<boolean[]>(
        `(() => { const s = document.querySelector('#tourPick .vsSide1').getBoundingClientRect(); return Array.from(document.querySelectorAll('#tourPick .tsRow'), (r) => { const q = r.getBoundingClientRect(); return q.left >= s.left - 1 && q.right <= s.right + 1; }); })()`,
      ),
    ).toEqual([true, true, true]);
    await page.screenshot({ path: info.outputPath(`tour-${String(vp.w)}.png`) });
    expect(errors).toEqual([]);
  });
}
