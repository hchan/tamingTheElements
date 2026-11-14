import { expect, test } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';

// The virtual move stick: visible on a coarse-pointer phone (844x390), absent with a mouse, and it holds the move keys.

test.describe('phone landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('stick is shown and drives the move keys; screenshot', async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade`);
    await page.getByRole('button', { name: 'Versus', exact: true }).tap();
    await page.getByRole('button', { name: 'Fight' }).tap();
    const stick = page.locator('#touchStick');
    await expect(stick).toBeVisible();
    await expect(page.locator('#arcadeSuper')).toBeVisible();
    await page.evaluate(`(() => { window.__keys = []; for (const t of ['keydown','keyup']) window.addEventListener(t, (e) => window.__keys.push(t + ':' + e.code)); })()`);
    const box = await stick.boundingBox();
    if (!box) throw new Error('no stick box');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(390);
    const cdp = await page.context().newCDPSession(page);
    const pt = (type: 'touchStart' | 'touchEnd', x: number, y: number): Promise<unknown> =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await pt('touchStart', cx + 35, cy - 35);
    await expect.poll(() => page.evaluate(`window.__keys.join()`)).toBe('keydown:ArrowRight,keydown:ArrowUp');
    await info.attach('touch-stick-ne', { body: await page.screenshot(), contentType: 'image/png' });
    await page.screenshot({ path: `${process.env['HOME'] ?? ''}/claudetmp/qa/touch-stick-ne.png` });
    await pt('touchEnd', 0, 0);
    const keys = await page.evaluate<string>(`window.__keys.join()`);
    expect(keys).toContain('keyup:ArrowRight');
    expect(keys).toContain('keyup:ArrowUp');
    expect(errors).toEqual([]);
  });
});

test('no stick for a mouse desktop', async ({ page }) => {
  await page.goto(`${START}&ff=arcade`);
  await page.getByRole('button', { name: 'Versus', exact: true }).click();
  await page.getByRole('button', { name: 'Fight' }).click();
  await expect(page.locator('#arcadeSuper')).toBeVisible();
  await expect(page.locator('#touchStick')).toBeHidden();
});
