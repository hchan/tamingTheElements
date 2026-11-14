import { type BrowserContext, expect, type Page, test } from '@playwright/test';

// WP 05 (docs/WEBRTC-PLAN.md): leaving an online match. Two separate contexts connect over loopback WebRTC and start a match
// (scripted AIs, `?ff=netbot`); then one side leaves (Leave button, or its page is closed) and the other must say so at once
// (a BYE on the control channel), not after the 5 s input timeout.

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] } });

const opened: BrowserContext[] = [];
test.afterEach(async () => {
  for (const c of opened.splice(0)) await c.close();
});

/** Connects two fresh contexts through the real screen and waits until both sims are running. */
async function startMatch(browser: import('@playwright/test').Browser): Promise<{ a: Page; b: Page }> {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  opened.push(ctxA, ctxB);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const url = '/?ff=arcade,netbot&ice=none#online';
  await a.goto(url);
  await b.goto(url);
  await a.locator('#onlineHost').click();
  await expect(a.locator('#onlineOffer')).not.toHaveValue('', { timeout: 15_000 });
  await b.locator('#onlineOfferIn').fill(await a.locator('#onlineOffer').inputValue());
  await b.locator('#onlineJoin').click();
  await expect(b.locator('#onlineAnswer')).not.toHaveValue('', { timeout: 15_000 });
  await a.locator('#onlineAnswerIn').fill(await b.locator('#onlineAnswer').inputValue());
  await a.locator('#onlineConnect').click();
  await expect(a.locator('#onlineLeave')).toBeVisible({ timeout: 20_000 });
  await a.locator('#onlineReady').click();
  await b.locator('#onlineReady').click();
  for (const p of [a, b]) {
    await expect(p.locator('#onlineStatus')).toContainText('Connected. Both games', { timeout: 30_000 });
    await p.waitForFunction('(window.__TTE__?.net()?.simTick ?? 0) > 50', undefined, { timeout: 60_000 });
  }
  return { a, b };
}

test('Leave: the friend is told at once, the leaver goes back to the menu', async ({ browser }) => {
  test.setTimeout(240_000);
  const { a, b } = await startMatch(browser);
  await b.locator('#onlineLeave').click();
  await expect(a.locator('#onlineStatus')).toContainText('Your friend left the match', { timeout: 3000 });
  await expect(a.locator('#onlineLeave')).toHaveCount(0);
  await expect(a.locator('#onlineAgain')).toHaveCount(0);
  await expect(b).toHaveURL(/#main$/);
  for (const page of [a, b]) {
    await page.goto('/?ff=arcade#main');
    await page.evaluate('window.__TTE__?.settled()');
  }
});

test('closing the page mid-match: the friend sees the words within 3 s', async ({ browser }) => {
  test.setTimeout(240_000);
  const { a, b } = await startMatch(browser);
  await b.close({ runBeforeUnload: true });
  await expect(a.locator('#onlineStatus')).toContainText(/Your friend left the match|The link to your friend was lost/, { timeout: 3000 });
  await a.goto('/?ff=arcade#main');
  await a.evaluate('window.__TTE__?.settled()');
});
