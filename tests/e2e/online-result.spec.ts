import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { type BrowserContext, expect, type Page, test, type WebSocketRoute } from '@playwright/test';
import { RelayCore, type RelayCtx, type RelayEvent, type RelayOptions, type Sender } from '../../src/core/relay';
import { DISCONNECT_GRACE_MS } from '../../src/core/relay/constants';
import { InMemoryStore } from '../../src/core/relay/testing';

// ONLINE-RESULT-E2E (tests/e2e/online-quick.spec.ts is the setup-handshake sibling): two pages play a short online match to the end
// against the in-repo RelayCore (behind a Playwright interception of a placeholder host, nothing leaves the machine). The game
// sends HASH and RESULT (src/game/net/ws/match-report.ts), so the relay records the match as agreed and both pages show the same
// outcome; (Play again is a recorded known bug, below). A forced socket drop must resume the same match. The short match is `?matchticks=N`
// (dev and test builds only, src/game/app/online-arena.ts); `?ff=netbot` drives both sides.
//
// Run (the router picks the machine): corepack pnpm e2e -- tests/e2e/online-result.spec.ts

const ONLINE_URL = 'https://relay.example.invalid';
const OUT_DIR = 'node_modules/.tte-e2e-online-result';
const BUILD_ENV = { ...process.env, VITE_ONLINE_URL: ONLINE_URL };
const MATCH_TICKS = 300; // 6 s of sim at 50 Hz.

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

let preview: ChildProcess | undefined;
let origin = '';
const opened: BrowserContext[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      s.close(() => { resolve(port); });
    });
  });
}

async function waitUp(url: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`preview did not come up at ${url}`);
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const build = spawnSync('corepack', ['pnpm', 'exec', 'vite', 'build', '--mode', 'test', '--outDir', OUT_DIR, '--emptyOutDir'], { env: BUILD_ENV, stdio: 'inherit' });
  if (build.status !== 0) throw new Error(`vite build failed (status ${String(build.status)})`);
  const port = await freePort();
  preview = spawn('corepack', ['pnpm', 'exec', 'vite', 'preview', '--outDir', OUT_DIR, '--port', String(port), '--strictPort'], { stdio: 'inherit' });
  origin = `http://localhost:${String(port)}`;
  await waitUp(origin);
});

test.afterAll(() => {
  preview?.kill('SIGTERM');
  preview = undefined;
});

test.afterEach(async () => {
  for (const c of opened.splice(0)) await c.close();
});

class RouteSender implements Sender {
  readonly routes = new Map<string, WebSocketRoute>();
  /** When true the relay sends each frame as a binary message holding the same ASCII text (docs/ONLINE-PROTOCOL.md); the client reads it as an ArrayBuffer. */
  binary = false;
  send(conn: string, text: string): void {
    this.routes.get(conn)?.send(this.binary ? Buffer.from(text, 'ascii') : text);
  }
  close(conn: string, code: number): void {
    void this.routes.get(conn)?.close({ code });
  }
}

interface Rig {
  readonly core: RelayCore;
  readonly sender: RouteSender;
  readonly ctx: RelayCtx;
  readonly events: RelayEvent[];
  /** Added to the relay's clock (ms): a test moves time past the disconnect grace without waiting for it. */
  skewMs: number;
}

async function serve(page: Page, name: string, rig: Rig): Promise<void> {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
  await page.route(`${ONLINE_URL}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const path = new URL(req.url()).pathname;
    const body = path === '/session' ? { session: `s-${name}`, expiresIn: 3600 } : path === '/ticket' ? { ticket: `t-${name}`, url: `wss://relay.example.invalid/ws?ticket=t-${name}` } : undefined;
    if (body === undefined) return route.fulfill({ status: 404, headers: cors });
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });
  await page.routeWebSocket(/^wss:\/\/relay\.example\.invalid/, (ws) => {
    rig.sender.routes.set(name, ws);
    ws.onMessage((m) => {
      if (typeof m === 'string') void rig.core.handle(name, m, rig.ctx);
    });
    ws.onClose(() => {
      if (rig.sender.routes.get(name) === ws) rig.sender.routes.delete(name);
      void rig.core.handleClose(name, rig.ctx);
    });
  });
}

/** Two pages, matched, picks done, arenas running (short match, bots on both sides). */
async function startMatch(browser: import('@playwright/test').Browser, opts: { binary?: boolean; relay?: Partial<RelayOptions>; ticks?: number } = {}): Promise<{ rig: Rig; a: Page; b: Page }> {
  const events: RelayEvent[] = [];
  const sender = new RouteSender();
  sender.binary = opts.binary === true;
  const clock = { skew: 0 };
  const ctx: RelayCtx = { now: () => Date.now() + clock.skew, randomInt: (n) => Math.floor(Math.random() * n) };
  const core = new RelayCore(new InMemoryStore(() => ctx.now()), sender, { ...opts.relay, onEvent: (e) => { events.push(e); } });
  const rig: Rig = { core, sender, ctx, events, get skewMs() { return clock.skew; }, set skewMs(v: number) { clock.skew = v; } };
  const pages: Page[] = [];
  for (const name of ['a', 'b']) {
    const context = await browser.newContext();
    opened.push(context);
    const page = await context.newPage();
    await serve(page, name, rig);
    await page.goto(`${origin}/?matchticks=${String(opts.ticks ?? MATCH_TICKS)}&ff=netbot#online`);
    pages.push(page);
  }
  const [a, b] = pages as [Page, Page];
  for (const p of pages) await expect(p.locator('#quickFind')).toBeVisible({ timeout: 30_000 });
  await a.locator('#quickFind').click();
  await expect(a.locator('#quickStatus')).toContainText('Looking for an opponent', { timeout: 20_000 });
  await b.locator('#quickFind').click();
  await pickAndReady(pages);
  return { rig, a, b };
}

async function pickAndReady(pages: Page[]): Promise<void> {
  for (const p of pages) {
    await expect(p.locator('#quickStatus')).toContainText('Opponent found', { timeout: 20_000 });
    await expect(p.locator('#quickReady')).toBeVisible();
  }
  await pages[0]?.locator('#quickReady').click();
  await pages[1]?.locator('#quickReady').click();
  for (const p of pages) {
    await expect(p.locator('#quickMenu')).toBeVisible({ timeout: 30_000 });
    await expect(p.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    // Layout (user report: too much black margin): in a match the arena fills the viewport as in Play; the controls are folded into the round menu icon.
    const top = await p.evaluate<number>(`document.querySelector('#game')?.getBoundingClientRect().top ?? -1`);
    expect(top, 'arena starts at the top of the screen').toBeGreaterThanOrEqual(0);
    expect(top, 'arena starts at the top of the screen').toBeLessThanOrEqual(2);
    await expect(p.locator('#quickLeave')).toBeHidden();
    await p.locator('#quickMenu').click();
    await expect(p.locator('#quickLeave')).toBeVisible();
    await expect(p.locator('#quickLink')).toBeVisible();
    await p.locator('#quickMenu').click();
    await expect(p.locator('#quickLeave')).toBeHidden();
    await expect(p.locator('#quickBack')).toBeHidden();
  }
}

const results = (rig: Rig): Extract<RelayEvent, { kind: 'result' }>[] => rig.events.filter((e): e is Extract<RelayEvent, { kind: 'result' }> => e.kind === 'result');

/** The result lines of both pages describe the same outcome from the two sides. */
function mirrored(x: string, y: string): boolean {
  if (x.includes('draw')) return y.includes('draw');
  return x.includes('You won') ? y.includes('opponent won') : y.includes('You won');
}

test('both pages end a short match and the relay records it agreed', async ({ browser }) => {
  test.setTimeout(240_000);
  const { rig, a, b } = await startMatch(browser);

  // The match runs to the tick limit; both pages show an end line and the Play again button.
  for (const p of [a, b]) await expect(p.locator('#quickAgain')).toBeVisible({ timeout: 90_000 });
  const ta = (await a.locator('#quickStatus').textContent()) ?? '';
  const tb = (await b.locator('#quickStatus').textContent()) ?? '';
  expect(ta).toMatch(/match|draw/i);
  expect(mirrored(ta, tb), `${ta} / ${tb}`).toBe(true);
  for (const p of [a, b]) await expect(p.locator('#quickFailure')).toBeHidden();

  // RESULT and HASH reached the relay and agree (RESULT_ACK 0 is what stops the clients resending).
  await expect.poll(() => results(rig).length, { timeout: 15_000, message: 'relay result events' }).toBeGreaterThan(0);
  expect(results(rig).every((r) => r.agreed)).toBe(true);
  expect(rig.events.some((e) => e.kind === 'desync')).toBe(false);
  expect(results(rig)).toHaveLength(1);

  // Back (the ended view has Play again and Back) goes to the menu.
  await a.locator('#quickBack').click();
  await expect(a).toHaveURL(/#main$/);
  await a.evaluate('window.__TTE__?.settled()');
});

// Fixed client bug online-again-stray-batch: Play again sends QUEUE_JOIN while the finished arena is still being destroyed (Phaser finishes a frame later), and one more BATCH used to leave
// after it; the relay answered bad-frame and closed 4001, so the second match never started. The transport now drops match frames after `endMatch` (OnlineClient.leaveMatch).
test('Play again starts a second agreed match', async ({ browser }) => {
  test.setTimeout(240_000);
  const { rig, a, b } = await startMatch(browser);
  for (const p of [a, b]) await expect(p.locator('#quickAgain')).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => results(rig).length, { timeout: 15_000, message: 'relay result events' }).toBe(1);
  // Both queue, are matched anew, and a second arena runs.
  await a.locator('#quickAgain').click();
  await b.locator('#quickAgain').click();
  await pickAndReady([a, b]);
  expect(rig.events.filter((e) => e.kind === 'match-start')).toHaveLength(2);
  for (const p of [a, b]) await expect(p.locator('#quickAgain')).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => results(rig).length, { timeout: 15_000, message: 'relay result events' }).toBe(2);
  expect(results(rig).every((r) => r.agreed)).toBe(true);

  await a.locator('#quickBack').click();
  await expect(a).toHaveURL(/#main$/);
});

test('a dropped socket mid-match resumes the same match, with no second game', async ({ browser }) => {
  test.setTimeout(240_000);
  const { rig, a, b } = await startMatch(browser);

  // Cut a's socket (close code 1006 on the page side) a moment into the match; the client redials by itself and resumes.
  await new Promise((r) => setTimeout(r, 1500)); // let the match run before the drop
  const route = rig.sender.routes.get('a');
  expect(route).toBeDefined();
  await route?.close({ code: 1006 });

  for (const p of [a, b]) await expect(p.locator('#quickAgain')).toBeVisible({ timeout: 90_000 });
  expect(rig.events.filter((e) => e.kind === 'match-start')).toHaveLength(1);
  await expect.poll(() => results(rig).length, { timeout: 15_000, message: 'relay result events' }).toBeGreaterThan(0);
  expect(results(rig).every((r) => r.agreed)).toBe(true);
  expect(rig.events.some((e) => e.kind === 'desync')).toBe(false);
  for (const p of [a, b]) await expect(p.locator('#quickFailure')).toBeHidden();
});

// Long gate (two pages, about 40 s, estimate). Same match with every relay frame sent as a binary WebSocket message (ASCII text inside): the real browser path of
// inbound.ts (binaryType arraybuffer, synchronous decode) rather than the unit-test fake.
test('a match with binary relay frames ends agreed on both pages', async ({ browser }) => {
  test.setTimeout(240_000);
  const { rig, a, b } = await startMatch(browser, { binary: true });
  for (const p of [a, b]) await expect(p.locator('#quickAgain')).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => results(rig).length, { timeout: 15_000, message: 'relay result events' }).toBeGreaterThan(0);
  expect(results(rig).every((r) => r.agreed)).toBe(true);
  expect(rig.events.some((e) => e.kind === 'desync')).toBe(false);
  for (const p of [a, b]) await expect(p.locator('#quickFailure')).toBeHidden();
});

// Long gate (two pages, about 40 s on the PC, measurement). Page b is reported hidden for 3 s (headless has no real tab switch, so document.hidden is overridden and visibilitychange fired, as
// tests/e2e/pause-reasons.spec.ts does). Arena then calls session.setHidden, so the hidden side keeps the peer informed; the match must still end agreed with no failure banner.
test('a tab hidden for a few seconds mid-match still ends agreed on both pages', async ({ browser }) => {
  test.setTimeout(240_000);
  const { rig, a, b } = await startMatch(browser);
  const setHidden = (hidden: boolean): Promise<unknown> =>
    b.evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => ${String(hidden)} }); document.dispatchEvent(new Event('visibilitychange'))`);
  await new Promise((r) => setTimeout(r, 1000));
  await setHidden(true);
  await new Promise((r) => setTimeout(r, 3000)); // estimate: well under the stall timeout
  await setHidden(false);
  for (const p of [a, b]) await expect(p.locator('#quickAgain')).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => results(rig).length, { timeout: 15_000, message: 'relay result events' }).toBeGreaterThan(0);
  expect(results(rig).every((r) => r.agreed)).toBe(true);
  expect(rig.events.some((e) => e.kind === 'desync')).toBe(false);
  expect(rig.events.filter((e) => e.kind === 'match-start')).toHaveLength(1);
  for (const p of [a, b]) await expect(p.locator('#quickFailure')).toBeHidden();
});

// Long gate (two pages, about 15 s). The opponent closes the page and never comes back. The lockstep stall timeout (DEFAULT_TIMEOUT_TICKS, about 5 s)
// fires first and ends the match on the remaining page ("Connection lost. The match ended with no winner."); the relay's grace is longer (10 s), so PEER_STATUS gone
// only arrives afterwards. The page must stay ended on the win line (no hang, no failure banner, no second game) when gone arrives. The clock is
// skewed past DISCONNECT_GRACE_MS so the test does not wait the real grace; the real sweep delay (about 10 to 70 s after a drop) is the relay's own.
// The "Your opponent left" line is only reachable when gone arrives during a live match (a paused match), which this rig does not produce.
test('Opponent gone after the stall timeout: the remaining page stays ended on the no-winner line', async ({ browser }) => {
  test.setTimeout(240_000);
  const { rig, a, b } = await startMatch(browser);
  await new Promise((r) => setTimeout(r, 1500)); // let the match run before the drop
  await a.close();
  // Playwright may not report a page close to the route's onClose; tell the relay the socket closed (a repeat is a no-op, the record is already 'closed').
  await rig.core.handleClose('a', rig.ctx);
  await expect(b.locator('#quickStatus')).toContainText('ended with no winner', { timeout: 60_000 }); // estimate: the stall timeout is about 15 s of session ticks, slower on a loaded PC (one 30 s miss seen)

  rig.skewMs += DISCONNECT_GRACE_MS + 1000;
  await rig.core.sweep(rig.ctx);
  await expect.poll(() => rig.events.filter((e) => e.kind === 'peer-gone').length, { timeout: 15_000, message: 'relay peer-gone' }).toBe(1);
  await expect(b.locator('#quickStatus')).toContainText('ended with no winner');
  await expect(b.locator('#quickFailure')).toBeHidden();
  expect(rig.events.filter((e) => e.kind === 'match-start')).toHaveLength(1);
  await expect(b.locator('#quickBack')).toBeVisible();
});

/** Types `text` into the dock and sends it (the dock must be open). */
async function say(p: Page, text: string): Promise<void> {
  await p.locator('#chatInput').fill(text);
  await p.locator('#chatSend').click();
}
const openDock = async (p: Page): Promise<void> => {
  if ((await p.locator('#chatToggle').getAttribute('aria-expanded')) !== 'true') await p.locator('#chatToggle').click();
  await expect(p.locator('#chatPanel')).toBeVisible();
};
const hasLine = (p: Page, cls: string, text: string) => p.locator(`.chat-line.${cls}`, { hasText: text });

// Long gate (two pages, about 60 s, estimate; not @smoke: two browsers and over 20 s). Relay chat on: a line goes both ways, an unread badge shows while the
// dock is collapsed, a quick burst shows the client rate note, the relay's chat events carry counts only, and chat still works on the result screen.
test('chat: lines both ways, unread badge, rate note, counts-only events, and chat on the result screen', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const { rig, a, b } = await startMatch(browser, { relay: { chat: true }, ticks: 1500 });
  for (const p of [a, b]) await expect(p.locator('#chatDock')).toBeVisible();
  await openDock(a);
  await openDock(b);

  await say(a, 'hello from a');
  await expect(hasLine(b, 'chat-opponent', 'hello from a')).toBeVisible({ timeout: 15_000 });
  await expect(hasLine(a, 'chat-you', 'hello from a')).toBeVisible();
  await say(b, 'hi from b');
  await expect(hasLine(a, 'chat-opponent', 'hi from b')).toBeVisible({ timeout: 15_000 });

  // b collapses; a's next line shows as unread on b, and opening clears it.
  await b.locator('#chatToggle').click();
  await expect(b.locator('#chatPanel')).toBeHidden();
  await say(a, 'unread one');
  await expect(b.locator('#chatUnread')).toHaveText('1', { timeout: 15_000 });
  await expect(b.locator('#chatToggle')).toHaveAttribute('aria-label', 'Chat, 1 unread');
  await openDock(b);
  await expect(b.locator('#chatUnread')).toHaveText('');
  await expect(hasLine(b, 'chat-opponent', 'unread one')).toBeVisible();
  await testInfo.attach('match-a', { body: await a.screenshot(), contentType: 'image/png' });
  await testInfo.attach('match-b', { body: await b.screenshot(), contentType: 'image/png' });

  // Three lines so far from a, spaced out by the round trips, so the relay never rate-limited them.
  expect(rig.events.filter((e) => e.kind === 'chat' && e.outcome === 'rate')).toHaveLength(0);
  // A quick burst of four more: the client bucket (3 per burst, 1/s refill) refuses one with a "Wait" note.
  // One synchronous page task: a loaded runner that spends over a second between two say() calls refills a token, a later sent line clears the note and the check flakes.
  await a.evaluate(`(() => {
    for (const t of ['q1', 'q2', 'q3', 'q4']) {
      const input = document.getElementById('chatInput');
      input.value = t;
      input.dispatchEvent(new Event('input', { bubbles: true })); // enables Send, as typing does
      document.getElementById('chatSend').click();
    }
  })()`);
  await expect.poll(() => a.locator('#chatNote').textContent(), { timeout: 10_000, message: 'rate note on a' }).toMatch(/Wait|too fast/);

  // Counts only: the relay's events never hold a line's text.
  const dump = JSON.stringify(rig.events);
  for (const t of ['hello from a', 'hi from b', 'unread one', 'q1']) expect(dump).not.toContain(t);
  expect(rig.events.some((e) => e.kind === 'chat')).toBe(true);

  // The result screen still chats both ways (the dock stays in 'ended'); say() retries while the client bucket refills.
  for (const p of [a, b]) await expect(p.locator('#quickAgain')).toBeVisible({ timeout: 120_000 });
  await expect.poll(() => results(rig).length, { timeout: 15_000, message: 'relay result events' }).toBe(1);
  expect(rig.events.some((e) => e.kind === 'desync')).toBe(false);
  for (const p of [a, b]) await expect(p.locator('#chatDock')).toBeVisible();
  await openDock(a);
  await openDock(b);
  await expect.poll(async () => { await say(a, 'gg from a'); return hasLine(b, 'chat-opponent', 'gg from a').count(); }, { timeout: 20_000, message: 'a line after the result' }).toBeGreaterThan(0);
  await expect.poll(async () => { await say(b, 'gg from b'); return hasLine(a, 'chat-opponent', 'gg from b').count(); }, { timeout: 20_000, message: 'b line after the result' }).toBeGreaterThan(0);
  expect(JSON.stringify(rig.events)).not.toContain('gg from');
  await testInfo.attach('result-a', { body: await a.screenshot(), contentType: 'image/png' });
  await testInfo.attach('result-b', { body: await b.screenshot(), contentType: 'image/png' });
});

// Long gate (two pages, about 1 min, estimate; two browsers). With relay chat off (default, like relay 1.0.0) there is no dock at all, and the match still finishes
// with agreed results. Long gate because it needs two browsers and a built bundle (the short gate stays @smoke only).
test('chat: with relay chat off the dock is hidden and the match still finishes', async ({ browser }) => {
  test.setTimeout(240_000);
  const { a, b, rig } = await startMatch(browser);
  for (const p of [a, b]) await expect(p.locator('#chatDock')).toBeHidden();
  await expect.poll(() => results(rig).length, { timeout: 120_000, message: 'relay result events' }).toBeGreaterThan(0);
  expect(results(rig).every((r) => r.agreed)).toBe(true);
  for (const p of [a, b]) await expect(p.locator('#chatDock')).toBeHidden();
});
