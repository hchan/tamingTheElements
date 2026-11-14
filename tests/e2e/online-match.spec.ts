import { type BrowserContext, expect, type Page, test } from '@playwright/test';

// The two-context proof (docs/WEBRTC-PLAN.md WP 01): a full online match between two SEPARATE browser contexts (own storage, own
// network stack, like two machines) over loopback WebRTC. Both sides are played by the Arcade scripted AI (`?ff=netbot`), the
// link needs no STUN server (`?ice=none`), and the proof is that both pages finish with the same winner and identical
// checkpoint hash lists. Once in plain lockstep and once with rollback.

// Chromium hides host candidates behind mDNS names (.local), which two contexts cannot always resolve on a loopback-only
// host; this spec only needs the real addresses, so it turns that hiding off (other specs keep the default).
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] } });

// A natural Arcade match is about 10 000 sim ticks (best of 3 rounds with the scripted AI: 10 393 measured), i.e. 5 to 6 minutes
// per variant on two SwiftShader pages. So the default run ends the match as a draw at MATCH_TICKS (`?matchticks=`, 80 s of
// sim, 80 checkpoints) and `TTE_NATURAL_MATCH=1` plays to the sim's own result (real winner, rounds line).
const NATURAL = process.env['TTE_NATURAL_MATCH'] === '1';
const MATCH_TICKS = 4000;

const opened: BrowserContext[] = [];
test.afterEach(async () => {
  for (const c of opened.splice(0)) await c.close();
});

interface Net {
  side: 0 | 1;
  status: string;
  simTick: number;
  desync: unknown;
  winner: number | null;
  checkpoints: [number, number][];
}

const readNet = (page: Page): Promise<Net | undefined> => page.evaluate<Net | undefined>('window.__TTE__?.net()');

/**
 * Waits until the match on `page` has ended, by sim progress and not wall-clock: a loaded machine runs two software-rendered
 * pages slowly, so the only failure is a sim tick that stops advancing for `stallMs` (or a stopped match that is not `ended`).
 */
async function waitForEnd(page: Page, stallMs = 10_000): Promise<Net> {
  let last = -1;
  let lastMove = Date.now();
  for (;;) {
    const net = await readNet(page);
    if (net) {
      if (net.status === 'ended') return net;
      if (net.status === 'desync' || net.status === 'forfeit') throw new Error(`match stopped: ${net.status} at tick ${String(net.simTick)}`);
      if (net.simTick !== last) {
        last = net.simTick;
        lastMove = Date.now();
      }
    }
    if (Date.now() - lastMove > stallMs) throw new Error(`sim stalled at tick ${String(last)} for ${String(stallMs)} ms (status ${net?.status ?? 'no session'})`);
    // Progress is polled; the wait itself is an event wait that cannot be satisfied (a pause between polls, not a fixed sleep).
    await page.locator('#onlineAgain').waitFor({ state: 'visible', timeout: 500 }).catch(() => undefined);
  }
}

for (const ff of ['arcade,netbot', 'arcade,rollback,netbot']) test(`two browser contexts play a whole online match to the same result (${ff})`, async ({ browser }) => {
  test.setTimeout(NATURAL ? 900_000 : 240_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  opened.push(ctxA, ctxB);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const url = `/?ff=${ff}&ice=none${NATURAL ? '' : `&matchticks=${String(MATCH_TICKS)}`}#online`;
  await a.goto(url);
  await b.goto(url);
  await expect(a.locator('#onlineHost')).toBeVisible();
  await expect(b.locator('#onlineJoin')).toBeVisible();

  await a.locator('#onlineHost').click();
  await expect(a.locator('#onlineOffer')).not.toHaveValue('', { timeout: 15_000 });
  await b.locator('#onlineOfferIn').fill(await a.locator('#onlineOffer').inputValue());
  await b.locator('#onlineJoin').click();
  await expect(b.locator('#onlineAnswer')).not.toHaveValue('', { timeout: 15_000 });
  await a.locator('#onlineAnswerIn').fill(await b.locator('#onlineAnswer').inputValue());
  await a.locator('#onlineConnect').click();

  await a.locator('#onlineReady').click();
  await b.locator('#onlineReady').click();
  await expect(a.locator('#onlineStatus')).toContainText('Connected. Both games', { timeout: 20_000 });
  await expect(b.locator('#onlineStatus')).toContainText('Connected. Both games', { timeout: 20_000 });

  // Both sims run to the match end (the sim's own result when natural, the tick limit otherwise).
  const [na, nb] = await Promise.all([waitForEnd(a), waitForEnd(b)]);
  console.log(`[${ff}] match ended at sim tick ${String(na.simTick)} / ${String(nb.simTick)}, winner ${String(na.winner)}, ${String(na.checkpoints.length)} checkpoints`);

  expect(na.desync).toBeUndefined();
  expect(nb.desync).toBeUndefined();
  expect(na.winner).not.toBeNull();
  expect(nb.winner).toBe(na.winner);
  expect(na.checkpoints.length).toBeGreaterThanOrEqual(10);
  expect(nb.checkpoints.length).toBeGreaterThanOrEqual(10);

  // Same hash at every checkpoint tick both sides logged (one side may have logged one more before the other stopped).
  const hashesB = new Map(nb.checkpoints);
  let common = 0;
  for (const [tick, hash] of na.checkpoints) {
    const other = hashesB.get(tick);
    if (other === undefined) continue;
    common++;
    expect(other, `hash at tick ${String(tick)}`).toBe(hash);
  }
  expect(common).toBeGreaterThanOrEqual(10);
  expect(Math.abs(na.checkpoints.length - nb.checkpoints.length)).toBeLessThanOrEqual(1);

  // The result is worded on both pages; tear the games down and wait for Phaser's async destroy.
  const words = NATURAL ? 'Rounds' : 'draw';
  await expect(a.locator('#onlineStatus')).toContainText(words);
  await expect(b.locator('#onlineStatus')).toContainText(words);
  for (const page of [a, b]) {
    await page.goto('/?ff=arcade#main');
    await page.evaluate('window.__TTE__?.settled()');
  }
});
