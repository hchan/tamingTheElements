import { expect, test, type Page } from '@playwright/test';
import { START } from './parity/helpers';

// WP M1: the main menu's decorative hero showcase. Seeded by ?seed= in test builds, so the same URL shows the same heroes.
async function layerReady(page: Page): Promise<void> {
  await page.locator('#menuShowcase img').first().waitFor({ state: 'attached' });
  await page.waitForFunction(`[...document.querySelectorAll('#menuShowcase img')].every((i) => i.complete && i.naturalWidth > 0)`);
}

const HEROES = `[...document.querySelectorAll('.scSlot')].map((x) => x.dataset.hero)`;
const RUNNING = `document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest('#menuShowcase')).length`;

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720, count: 2 },
  { name: 'wide', width: 2560, height: 1440, count: 3 },
  { name: 'phone landscape', width: 844, height: 390, count: 2 },
  { name: 'phone portrait', width: 390, height: 844, count: 1 },
];

for (const vp of VIEWPORTS) {
  test(`showcase on ${vp.name}: ${String(vp.count)} loaded hero(es), inert, never over the buttons`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(START);
    await layerReady(page);
    await expect(page.locator('#menuShowcase img')).toHaveCount(vp.count);
    await expect(page.locator('#menuShowcase')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.evaluate<string>(`getComputedStyle(document.getElementById('menuShowcase')).pointerEvents`)).toBe('none');
    await expect(page.locator('.mainMenuList li button')).toHaveText(['Play', 'Versus', 'Online', 'Settings', 'Help']);
    for (const b of await page.locator('.mainMenuList li button').all()) {
      const box = await b.boundingBox();
      if (!box) throw new Error('no box');
      const hit = await page.evaluate<string>(`document.elementFromPoint(${String(box.x + box.width / 2)}, ${String(box.y + box.height / 2)})?.tagName`);
      expect(hit).toBe('BUTTON');
    }
    expect(await page.locator('body').innerText()).not.toMatch(/classic|arcade|ruleset|capture/i);
  });
}

test('the same seed shows the same heroes', async ({ page }) => {
  await page.goto(START);
  await layerReady(page);
  const a = await page.evaluate<string[]>(HEROES);
  await page.reload();
  await layerReady(page);
  expect(await page.evaluate<string[]>(HEROES)).toEqual(a);
});

test('reduced motion (OS and in-app): nothing in the showcase animates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(START);
  await layerReady(page);
  expect(await page.evaluate<number>(RUNNING)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await layerReady(page);
  // The in-app Reduce motion setting, turned on through Settings; the menu remounts when Save returns to it.
  await page.evaluate(`location.hash = '#settings'`);
  await page.getByLabel('Reduce motion').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(`window.__TTE__.state().mountedRoute === '#main'`);
  await layerReady(page);
  const running = await page.evaluate<number>(RUNNING);
  expect(running).toBeLessThanOrEqual(0);
});
