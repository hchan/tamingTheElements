import { expect, test } from '@playwright/test';
import { collectErrors, fixture, seedViaGameMaster, waitForRoute } from './parity/helpers';

test('Help lists the controls without banned words', async ({ page }) => {
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
  await expect(menu.getByRole('table', { name: /Player 2/ })).toBeVisible();
  await expect(menu.getByRole('table', { name: 'Gamepad' })).toBeVisible();
  await expect(menu.getByRole('table', { name: 'Touch' })).toBeVisible();
  await expect(p1.getByRole('row', { name: /^Trap Z or 0$/ })).toBeVisible();
  // innerText skips closed details: open them all first.
  await page.evaluate(`document.querySelectorAll('#menu details').forEach((d) => { d.open = true; })`);
  expect(await menu.innerText()).not.toMatch(/classic|arcade|ruleset|capture/i);
  expect(errors).toEqual([]);
});

// QA r18: on a short phone landscape screen the Help header is compact (no crest, one tab row) so the first heading is high up.
test('Help at 844x390: compact header, one row of tabs, first heading in the top half', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?seed=7#help');
  await waitForRoute(page, '#help');
  const m = await page.evaluate<{ tabsBottom: number; rows: number; headingTop: number }>(
    `(() => { const lis = [...document.querySelectorAll('#menu .helpLinks li')].map((l) => l.getBoundingClientRect());
      const h = document.getElementById('helpLessonsHeading').getBoundingClientRect();
      return { tabsBottom: Math.max(...lis.map((r) => r.bottom)), rows: new Set(lis.map((r) => Math.round(r.top))).size, headingTop: h.top }; })()`,
  );
  expect(m.rows).toBe(1);
  expect(m.tabsBottom).toBeLessThan(110);
  expect(m.headingTop).toBeLessThan(390 / 2); // was 2.5 before the slim Jump to row came back under the tabs (QA r31)
  // QA r31: the Jump to row is not hidden on a phone; it is a slim row under the tabs and its buttons scroll to the sections.
  const jump = await page.locator('nav.helpJump').boundingBox();
  expect(jump?.height ?? 0).toBeGreaterThan(20);
  expect(jump?.height ?? 999).toBeLessThan(60);
  await page.locator('nav.helpJump').getByRole('button', { name: 'Controls', exact: true }).click();
  await expect.poll(() => page.evaluate(`document.getElementById('helpControlsHeading').getBoundingClientRect().top`)).toBeLessThan(120);
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
  [390, 844, 3200],
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
