import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { type BrowserContext, expect, type Page, test, type WebSocketRoute } from '@playwright/test';
import { RelayCore, type RelayCtx, type RelayEvent, type Sender } from '../../src/core/relay';
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
  send(conn: string, text: string): void {
    this.routes.get(conn)?.send(text);
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
async function startMatch(browser: import('@playwright/test').Browser): Promise<{ rig: Rig; a: Page; b: Page }> {
  const events: RelayEvent[] = [];
  const sender = new RouteSender();
  const ctx: RelayCtx = { now: () => Date.now(), randomInt: (n) => Math.floor(Math.random() * n) };
  const core = new RelayCore(new InMemoryStore(() => ctx.now()), sender, { onEvent: (e) => { events.push(e); } });
  const rig: Rig = { core, sender, ctx, events };
  const pages: Page[] = [];
  for (const name of ['a', 'b']) {
    const context = await browser.newContext();
    opened.push(context);
    const page = await context.newPage();
    await serve(page, name, rig);
    await page.goto(`${origin}/?matchticks=${String(MATCH_TICKS)}&ff=netbot#online`);
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
    await expect(p.locator('#quickLink')).toBeVisible({ timeout: 30_000 });
    await expect(p.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
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
