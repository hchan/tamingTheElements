import { expect, type Page } from '@playwright/test';

/** Production build (no `__TTE__` hook): readiness is the rendered main menu, never a fixed wait. */
export async function gotoMenu(page: Page, path = '/tamingTheElements/'): Promise<void> {
  await page.goto(path);
  // The first entry (Play) is always enabled once the menu has mounted.
  const first = page.locator('#menu .mainMenuList li button').first();
  await expect(first).toBeVisible();
  await expect(first).toBeEnabled();
}
