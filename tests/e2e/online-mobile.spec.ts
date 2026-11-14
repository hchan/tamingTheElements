import { type BrowserContext, expect, test } from '@playwright/test';

// WP 06 (docs/WEBRTC-PLAN.md): online on a phone. One context is a touch phone (390x844, hasTouch, isMobile) playing by hand, the
// other a desktop page driven by the scripted AI (`?ff=netbot`); the phone must show the touch buttons during the match, a tap
// must press the action's key, and the screen must fit 360 px wide.

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] } });

const opened: BrowserContext[] = [];
test.afterEach(async () => {
  for (const c of opened.splice(0)) await c.close();
});

test('online match on a phone: touch buttons show and a tap presses the action key; the screen fits 360 px', async ({ browser }) => {
  test.setTimeout(240_000);
  const phone = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const desk = await browser.newContext();
  opened.push(phone, desk);
  const a = await phone.newPage();
  const b = await desk.newPage();
  await a.goto('/?ff=arcade&ice=none#online');
  await b.goto('/?ff=arcade,netbot&ice=none#online');

  await a.locator('#onlineHost').click();
  await expect(a.locator('#onlineOffer')).not.toHaveValue('', { timeout: 15_000 });
  await b.locator('#onlineOfferIn').fill(await a.locator('#onlineOffer').inputValue());
  await b.locator('#onlineJoin').click();
  await expect(b.locator('#onlineAnswer')).not.toHaveValue('', { timeout: 15_000 });
  await a.locator('#onlineAnswerIn').fill(await b.locator('#onlineAnswer').inputValue());

  // The connect screen at 360 px wide: nothing overflows horizontally, boxes fit, targets are at least 44 px.
  await a.setViewportSize({ width: 360, height: 640 });
  const fit = await a.evaluate<{ over: number; boxes: number; small: string[] }>(`(() => {
    const doc = document.documentElement;
    const boxes = [...document.querySelectorAll('#menu textarea')].map((t) => t.getBoundingClientRect().right);
    const small = [...document.querySelectorAll('#menu button, #menu select')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && Math.min(r.width, r.height) < 43.5;
    }).map((e) => e.id);
    return { over: doc.scrollWidth - doc.clientWidth, boxes: Math.max(...boxes), small };
  })()`);
  expect(fit.over).toBeLessThanOrEqual(0);
  expect(fit.boxes).toBeLessThanOrEqual(360);
  expect(fit.small).toEqual([]);
  await a.setViewportSize({ width: 390, height: 844 });

  await a.locator('#onlineConnect').click();
  await expect(a.locator('#onlineReady')).toBeVisible({ timeout: 20_000 });
  await a.locator('#onlineReady').tap();
  await b.locator('#onlineReady').click();
  for (const p of [a, b]) {
    await expect(p.locator('#onlineStatus')).toContainText('Connected. Both games', { timeout: 30_000 });
    await p.waitForFunction('(window.__TTE__?.net()?.simTick ?? 0) > 50', undefined, { timeout: 60_000 });
  }

  // No rotate overlay in an online match: it would pause our sim and stall the friend into a forfeit.
  await expect(a.locator('#rotateOverlay')).toHaveCount(0);
  const guard = a.locator('#arcadeGuard');
  await expect(guard).toBeVisible();
  expect(await a.locator('button.touchBtn:visible').count()).toBeGreaterThanOrEqual(3);
  await expect(a.locator('#touchStick')).toBeVisible();
  // A tap holds the key the keyboard agent listens to.
  await a.evaluate(`window.__keys = []; window.addEventListener('keydown', (e) => { window.__keys.push(e.code); });`);
  await guard.tap();
  await expect.poll(() => a.evaluate<number>('window.__keys.length')).toBeGreaterThan(0);

  for (const p of [a, b]) {
    await p.goto('/?ff=arcade#main');
    await p.evaluate('window.__TTE__?.settled()');
  }
});
