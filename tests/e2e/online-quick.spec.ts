import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { type BrowserContext, expect, type Page, test, type WebSocketRoute } from '@playwright/test';
import { RelayCore, type RelayCtx, type Sender } from '../../src/core/relay';
import { InMemoryStore } from '../../src/core/relay/testing';

// ONLINE-QM-E2E (ideas/brainstorm/online-quick-e2e.md): two pages on the Online quick-match screen of a build whose VITE_ONLINE_URL
// is set (docs/ONLINE-CLIENT.md): Find on both, matched, hero pick, Ready on both, the arena starts. The online service is
// the real RelayCore (src/core/relay) behind a Playwright interception of the placeholder host (HTTP /session and /ticket, and the
// WebSocket), so nothing leaves the machine and no real address is involved. The spec builds its own bundle with the variable set
// (the shared e2e build must stay unconfigured, because the other Online specs drive the WebRTC screen), so it is self-contained.
//
// Run (the coordinator, on the PC): corepack pnpm e2e -- tests/e2e/online-quick.spec.ts

const ONLINE_URL = 'https://relay.example.invalid';
const OUT_DIR = 'node_modules/.tte-e2e-online';
const BUILD_ENV = { ...process.env, VITE_ONLINE_URL: ONLINE_URL };

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

let preview: ChildProcess | undefined;
let origin = '';
const opened: BrowserContext[] = [];

/** A port nobody listens on right now (the preview gets it with --strictPort). */
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
  const build = spawnSync('corepack', ['pnpm', 'exec', 'vite', 'build', '--mode', 'test', '--outDir', OUT_DIR, '--emptyOutDir'], {
    env: BUILD_ENV,
    stdio: 'inherit',
  });
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

/** Frames out of the relay (base64 text, wire v3) go to the page's WebSocket route; closes map to close codes. */
class RouteSender implements Sender {
  readonly routes = new Map<string, WebSocketRoute>();
  send(conn: string, text: string): void {
    this.routes.get(conn)?.send(text);
  }
  close(conn: string, code: number): void {
    void this.routes.get(conn)?.close({ code });
  }
}

/** The fake online service of one test: guest session, ticket, and the relay over the intercepted WebSocket. */
async function serve(page: Page, name: string, core: RelayCore, sender: RouteSender, ctx: RelayCtx): Promise<void> {
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
    sender.routes.set(name, ws);
    ws.onMessage((m) => {
      if (typeof m === 'string') void core.handle(name, m, ctx); // A binary message is not a frame in wire v3.
    });
    ws.onClose(() => {
      sender.routes.delete(name);
      void core.handleClose(name, ctx);
    });
  });
}

test('two pages find each other, pick heroes and start the arena', async ({ browser }) => {
  test.setTimeout(180_000);
  const sender = new RouteSender();
  const ctx: RelayCtx = { now: () => Date.now(), randomInt: (n) => Math.floor(Math.random() * n) };
  const core = new RelayCore(new InMemoryStore(() => ctx.now()), sender);

  const pages: Page[] = [];
  for (const name of ['a', 'b']) {
    const context = await browser.newContext();
    opened.push(context);
    const page = await context.newPage();
    await serve(page, name, core, sender, ctx);
    await page.goto(`${origin}/#online`);
    pages.push(page);
  }
  const [a, b] = pages as [Page, Page];

  // The build is configured: the guest-first quick match, not the WebRTC screen.
  for (const p of pages) {
    await expect(p.locator('#quickFind')).toBeVisible({ timeout: 30_000 });
    await expect(p.locator('#onlineRoleHost')).toHaveCount(0);
  }

  // Queued (the second Find completes the pair), then matched with the hero pick.
  await a.locator('#quickFind').click();
  await expect(a.locator('#quickStatus')).toContainText('Looking for an opponent', { timeout: 20_000 });
  await expect(a.locator('#quickCancel')).toBeVisible();
  await b.locator('#quickFind').click();
  for (const p of pages) {
    await expect(p.locator('#quickStatus')).toContainText('Opponent found', { timeout: 20_000 });
    await expect(p.locator('#quickPick')).toBeVisible();
    await expect(p.locator('#quickReady')).toBeVisible();
  }

  // Hero pick: a, the lead hero keeps its default; b picks another lead from the list.
  expect(await b.locator('#quickRace1 option').count()).toBeGreaterThan(3);
  await b.locator('#quickRace1').selectOption({ index: 3 });

  await a.locator('#quickReady').click();
  await expect(a.locator('#quickStatus')).toContainText('Waiting for your opponent', { timeout: 10_000 });
  await b.locator('#quickReady').click();

  // Setup handshake, then both arenas run: the link line shows and a canvas is up.
  for (const p of pages) {
    await expect(p.locator('#quickLeave')).toBeVisible({ timeout: 30_000 });
    await expect(p.locator('#quickLink')).toBeVisible({ timeout: 30_000 });
    await expect(p.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    await expect(p.locator('#quickFailure')).toBeHidden();
    await expect(p.locator('#quickReady')).toBeHidden();
  }

  // Leave tears the arena down and goes to the menu.
  await a.locator('#quickLeave').click();
  await expect(a).toHaveURL(/#main$/);
  await a.evaluate('window.__TTE__?.settled()');
});
