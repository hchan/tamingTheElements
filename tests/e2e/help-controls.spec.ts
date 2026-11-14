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
  await expect(menu.getByRole('heading', { level: 2, name: 'Controls' })).toBeVisible();
  const p1 = menu.getByRole('table', { name: 'Keyboard, Player 1' });
  await expect(p1).toBeVisible();
  await expect(menu.getByRole('table', { name: /Player 2/ })).toBeVisible();
  await expect(menu.getByRole('table', { name: 'Gamepad' })).toBeVisible();
  await expect(menu.getByRole('table', { name: 'Touch' })).toBeVisible();
  await expect(p1.getByRole('row', { name: /^Trap Z or 0$/ })).toBeVisible();
  expect(await menu.innerText()).not.toMatch(/classic|arcade|ruleset|capture/i);
  expect(errors).toEqual([]);
});

// QA r18: on a short phone landscape screen the Help header is compact (no crest, one tab row) so the first heading is high up.
test('Help at 844x390: compact header, one row of tabs, first heading in the top 40 percent', async ({ page }) => {
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
  expect(m.headingTop).toBeLessThan(390 / 2.5);
  expect(errors).toEqual([]);
});
