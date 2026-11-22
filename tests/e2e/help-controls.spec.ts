import { expect, test } from '@playwright/test';
import { collectErrors, fixture, seedViaGameMaster, waitForRoute } from './parity/helpers';

test('Help lists the controls', async ({ page }) => {
  const errors = collectErrors(page);
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto('/?seed=7');
  await page.getByRole('heading', { level: 1, name: 'Taming the Elements' }).waitFor();
  await page.evaluate(`window.location.hash = '#help'`);
  await waitForRoute(page, '#help');
  const menu = page.locator('#menu');
  // Controls is closed by default; it is both a Jump button and a section summary, so scope the button to the nav.
  await page.locator('nav.helpJump').getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(menu.getByRole('heading', { level: 2, name: 'Controls' })).toBeVisible();
  const p1 = menu.getByRole('table', { name: 'Keyboard, Player 1' });
  await expect(p1).toBeVisible();
  // Table names, the Trap row and the banned words are asserted in src/ui/screens/help.dom.test.ts.
  expect(errors).toEqual([]);
});

// QA r51 #11: no elemental orb (crest) over the hero art on the Help page.
test('Help has no crest orb over the hero art', async ({ page }) => {
  await page.goto('/?seed=7#help');
  await waitForRoute(page, '#help');
  const content = await page.evaluate<string>(`getComputedStyle(document.querySelector('#menu .helpLinks'), '::before').content`);
  expect(content === 'none' || content === 'normal').toBe(true);
});

// QA r63 #3: the Help page was 4863 px tall at desktop and 6674 px on a phone; sections now collapse.
for (const [w, h, max] of [
  [1280, 720, 2000],
] as const) {
  test(`Help page height at ${String(w)}x${String(h)} stays within ${String(max)}px with the default sections`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?seed=7#help');
    await waitForRoute(page, '#help');
    const height = await page.evaluate<number>('document.documentElement.scrollHeight');
    expect(height).toBeLessThanOrEqual(max);
  });
}

test('Help: Back to top from the Controls section focuses the title, which is in view', async ({ page }) => {
  await page.goto('/?seed=7#help');
  await waitForRoute(page, '#help');
  await page.locator('nav.helpJump').getByRole('button', { name: 'Controls', exact: true }).click();
  await page.locator('section.helpControls button.helpTop').click();
  await expect.poll(() => page.evaluate(`document.activeElement && document.activeElement.id`)).toBe('helpTitle');
  await expect.poll(() => page.evaluate(`document.getElementById('helpTitle').getBoundingClientRect().top`)).toBeGreaterThanOrEqual(0);
});

// QA r127: at desktop size the Jump to label sits on its own line, then the five chips share one row.
test('Help at 1280x720: the Jump to label has its own line, then five chips in one row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?seed=7#help');
  await waitForRoute(page, '#help');
  const tops = await page.evaluate<number[]>(
    `[...document.querySelectorAll('nav.helpJump > *')].map((e) => { const r = e.getBoundingClientRect(); return Math.round((r.top + r.bottom) / 2 / 30); })`,
  );
  const counts = [...new Set(tops)].map((t) => tops.filter((x) => x === t).length);
  expect(counts).toEqual([1, 5]);
  if (process.env['SHOT_DIR']) await page.screenshot({ path: `${process.env['SHOT_DIR']}/help-1280.png` });
});
