import { expect, test, type Locator, type Page } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';

// Hero select drag and drop (real mouse): a click only previews, a drag drops a hero onto a team slot, slot-to-slot drag swaps.
const SELECTS = ['Hero 1 (lead)', 'Hero 2', 'Hero 3'] as const;
const team = async (page: Page): Promise<string[]> => Promise.all(SELECTS.map((l) => page.getByLabel(l, { exact: true }).inputValue()));

async function centre(l: Locator): Promise<{ x: number; y: number }> {
  await l.scrollIntoViewIfNeeded();
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function dragTo(page: Page, from: Locator, to: Locator, release = true): Promise<void> {
  const a = await centre(from);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const b = await centre(to);
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  if (release) await page.mouse.up();
}

test('Play picker: preview on click, drag a hero onto a slot, swap slots, never a duplicate', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#tour`);
  await page.getByLabel('Hero 1 (lead)').selectOption('fiara');
  await page.getByLabel('Hero 2').selectOption('rokcore');
  await page.getByLabel('Hero 3').selectOption('curomo');
  const tile = (name: RegExp): Locator => page.locator('.heroTile').filter({ hasText: name });
  const slot = (n: number): Locator => page.locator(`#tourSlot${String(n)}`);

  // A click previews: the panel shows the hero and the team is unchanged.
  await tile(/^Pax/).click();
  await expect(page.locator('.heroPanel .heroName')).toHaveText('Pax');
  await expect(page.locator('.heroPanel .heroAbility').first()).toBeVisible();
  expect(await team(page)).toEqual(['fiara', 'rokcore', 'curomo']);

  // Drag a new hero onto slot 2: mid-drag there is a ghost and a highlighted slot.
  await dragTo(page, tile(/^Pax/), slot(2), false);
  await expect(page.locator('.heroGhost')).toHaveCount(1);
  await expect(slot(2)).toHaveClass(/heroDropOn/);
  await page.mouse.up();
  await expect(page.locator('.heroGhost')).toHaveCount(0);
  expect(await team(page)).toEqual(['fiara', 'pax', 'curomo']);

  // Dropping a hero already in the team swaps it with the target slot's hero.
  await dragTo(page, tile(/^Curomo/), slot(1));
  expect(await team(page)).toEqual(['curomo', 'pax', 'fiara']);

  // Slot to slot swaps.
  await dragTo(page, slot(1), slot(3));
  expect(await team(page)).toEqual(['fiara', 'pax', 'curomo']);

  // A slot dragged back onto the grid leaves the team untouched.
  await dragTo(page, slot(2), tile(/^Rokcore/));
  expect(await team(page)).toEqual(['fiara', 'pax', 'curomo']);
  expect(new Set(await team(page)).size).toBe(3);

  // Preview, then "Add to team" assigns to the active slot.
  await tile(/^Rokcore/).click();
  await page.getByRole('button', { name: 'Add to team' }).click();
  expect(new Set(await team(page)).size).toBe(3);
  expect(await team(page)).toContain('rokcore');
  expect(errors).toEqual([]);
});
