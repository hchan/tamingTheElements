import { type BrowserContext, expect, test } from '@playwright/test';
import { startRelay, type RelayHandle } from '../../tools/signal-relay/server';

// WP 10 (docs/WEBRTC-PLAN.md): two separate contexts connect with a 6-character room code only (no code is copied or pasted),
// through the local relay (`tools/signal-relay`), then start a match. Loopback WebRTC, no STUN (`?ice=none`).

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] } });

const opened: BrowserContext[] = [];
let relay: RelayHandle | undefined;
test.afterEach(async () => {
  for (const c of opened.splice(0)) await c.close();
  await relay?.close();
  relay = undefined;
});

test('two contexts connect with a room code only', async ({ browser }) => {
  test.setTimeout(120_000);
  relay = await startRelay();
  const signal = `ws://127.0.0.1:${String(relay.port)}`;
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  opened.push(ctxA, ctxB);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const url = `/?ff=arcade,netbot&ice=none&signal=${encodeURIComponent(signal)}#online`;
  await a.goto(url);
  await b.goto(url);

  await a.locator('#onlineRoomHost').click();
  await expect(a.locator('#onlineRoomCode')).toHaveText(/^Room code: [A-HJ-NP-Z2-9]{6}$/, { timeout: 15_000 });
  const code = ((await a.locator('#onlineRoomCode').textContent()) ?? '').replace('Room code: ', '');
  await b.locator('#onlineRoomIn').fill(code.toLowerCase());
  await b.locator('#onlineRoomJoin').click();

  await expect(a.locator('#onlineReady')).toBeVisible({ timeout: 30_000 });
  await expect(b.locator('#onlineReady')).toBeVisible({ timeout: 30_000 });
  await a.locator('#onlineReady').click();
  await b.locator('#onlineReady').click();
  await expect(a.locator('#onlineStatus')).toContainText('Connected. Both games', { timeout: 20_000 });
  await expect(b.locator('#onlineStatus')).toContainText('Connected. Both games', { timeout: 20_000 });

  for (const page of [a, b]) {
    await page.goto('/?ff=arcade#main');
    await page.evaluate('window.__TTE__?.settled()');
  }
});

test('no room-code buttons without a relay address, and a wrong code says so in words', async ({ browser }) => {
  relay = await startRelay();
  const ctx = await browser.newContext();
  opened.push(ctx);
  const page = await ctx.newPage();
  await page.goto('/?ff=arcade&ice=none#online');
  await expect(page.locator('#onlineHost')).toBeVisible();
  await expect(page.locator('#onlineRoomHost')).toHaveCount(0);

  await page.goto(`/?ff=arcade&ice=none&signal=${encodeURIComponent(`ws://127.0.0.1:${String(relay.port)}`)}#online`);
  await page.locator('#onlineRoomIn').fill('ZZZZZZ');
  await page.locator('#onlineRoomJoin').click();
  await expect(page.locator('#onlineStatus')).toContainText('not found');
});
