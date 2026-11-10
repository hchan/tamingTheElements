import { expect, test } from '@playwright/test';

const READY = 'window.__TTE__ && window.__TTE__.ready === true';

// Page-side code is passed as strings because tsconfig.node has no DOM lib.
const RENDERER = `(() => {
  const c = document.querySelector('#game canvas');
  const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
  const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
})()`;

test('loads without console errors and shows the menu', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.waitForFunction(READY);
  await expect(page.locator('#menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('WebGL renderer is SwiftShader when a game canvas exists', async ({ page }) => {
  await page.goto('/?ff=play');
  await page.waitForFunction(READY);
  const hasCanvas = await page
    .locator('#game canvas')
    .waitFor({ timeout: 5000 })
    .then(
      () => true,
      () => false,
    );
  test.skip(!hasCanvas, 'no game canvas yet');
  expect(await page.evaluate<string>(RENDERER)).toContain('SwiftShader');
});
