// pnpm online:live-browser: two HEADLESS Chromium pages play one short match through the Online screen against a REAL relay.
// The address comes only from env TTE_RELAY_URL (https, no path): it is baked into a scratch build (VITE_ONLINE_URL) and never printed or written to the repo.
// One browser, two contexts, one match (`?matchticks=N`, bots drive both sides with `?ff=netbot`). Traffic is the game's own, paced by the relay's MATCH frame.
// Not part of the e2e suite or the PC router (the address lives only on the machine that has the env file). Exit: 0 ok, 1 a step failed, 2 bad config.
import { RateCounter } from './live-rate';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { parseOnlineUrl } from '../src/game/net/ws/config';
import { type FrameSample, jumpStats, parseArgs, rateLines, summarizeRuns, summaryLine } from './live-browser-match-lib';
import { LIVE_BROWSER_RUN_GAP_MS, LIVE_BROWSER_MATCH_TICKS, LIVE_BROWSER_STEP_MS, LIVE_BROWSER_END_MS, LIVE_BROWSER_PAGE_ORIGIN } from './live-browser-match-constants';

const OUT_DIR = '.scratch/live-browser-build';
const redact = (s: string): string => s.replace(/(https?|wss?):\/\/\S+/g, '<url>');

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      const port = typeof a === 'object' && a !== null ? a.port : 0;
      s.close(() => { resolve(port); });
    });
  });
}

async function waitUp(url: string): Promise<boolean> {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** The two end lines describe one outcome from both sides. */
export function mirrored(x: string, y: string): boolean {
  if (x.includes('draw')) return y.includes('draw');
  return x.includes('You won') ? y.includes('opponent won') : y.includes('You won');
}

/** One match. Frame counts come from Playwright websocket events, so they do not depend on the sockets closing first. */
export async function runOnce(env: Readonly<Record<string, string | undefined>>, out: (l: string) => void): Promise<number> {
  const raw = env['TTE_RELAY_URL'];
  if (!parseOnlineUrl(raw).configured) { out('TTE_RELAY_URL is not an https base URL'); return 2; }
  const t0 = performance.now();
  const sentA = new RateCounter(); const sentB = new RateCounter(); const sentAll = new RateCounter();
  // Receive-side evidence per client: count, last arrival, longest gap between arrivals (measurements, ms since t0).
  const recv: Record<string, { got: number; last: number; maxGap: number }> = { A: { got: 0, last: 0, maxGap: 0 }, B: { got: 0, last: 0, maxGap: 0 } };
  const recvLine = (): string => ['A', 'B'].map((n) => { const r = recv[n]; return r ? `${n} received ${String(r.got)}, last at ${String(r.last)} ms, longest gap ${String(r.maxGap)} ms` : ''; }).join('; ');
  const step = (s: string): void => { out(`${String(Math.round(performance.now() - t0)).padStart(6)} ms  ${s}`); };
  const build = spawnSync('corepack', ['pnpm', 'exec', 'vite', 'build', '--mode', 'test', '--outDir', OUT_DIR, '--emptyOutDir'], { env: { ...process.env, VITE_ONLINE_URL: raw ?? '' }, stdio: 'ignore' });
  if (build.status !== 0) { out('vite build failed'); return 1; }
  step('built');
  const port = await freePort();
  const preview = spawn('corepack', ['pnpm', 'exec', 'vite', 'preview', '--outDir', OUT_DIR, '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  const origin = `http://localhost:${String(port)}`;
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    if (!(await waitUp(origin))) { out('preview did not come up'); return 1; }
    const pages: Page[] = [];
    for (const name of ['A', 'B']) {
      const context = await browser.newContext();
      // The relay allows only the deployed game's origin (CORS), so the local build is served under that origin by routing; nothing leaves the machine except the relay calls.
      await context.route(`${LIVE_BROWSER_PAGE_ORIGIN}/**`, async (route) => {
        const res = await fetch(`${origin}${new URL(route.request().url()).pathname}`);
        await route.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
      });
      const page = await context.newPage();
      // Relay-side evidence, host-free: frame counts per direction and any short prose/JSON notice the gateway sent instead of a frame.
      page.on('websocket', (ws) => {
        let sent = 0; let got = 0;
        const outRate = new RateCounter(); const inRate = new RateCounter();
        ws.on('framesent', () => { sent++; const now = Date.now(); outRate.record(now); (name === 'A' ? sentA : sentB).record(now); sentAll.record(now); });
        ws.on('framereceived', (f) => {
          got++; inRate.record(Date.now());
          const r = recv[name]; const at = Math.round(performance.now() - t0);
          if (r) { if (r.got > 0) r.maxGap = Math.max(r.maxGap, at - r.last); r.got++; r.last = at; }
          const t = typeof f.payload === 'string' ? f.payload : '';
          if (t.length > 0 && t.length < 200 && (t.startsWith('{') || t.includes(' '))) step(`${name} gateway text after ${String(sent)} sent / ${String(got)} received: ${redact(t)}`);
        });
        ws.on('close', () => { step(`${name} socket closed: ${String(sent)} sent, ${String(got)} received; sent ${outRate.text()}; received ${inRate.text()}`); });
      });
      page.on('pageerror', (e) => { step(`${name} page error: ${redact(e.message).slice(0, 120)}`); });
      // Diagnostics, host-free: failed requests (method, path, reason), HTTP error statuses and console errors.
      const path = (u: string): string => { try { return new URL(u).pathname.replace(/^\/[^/]+/, '/<stage>'); } catch { return '<url>'; } };
      page.on('requestfailed', (r) => { step(`${name} request failed: ${r.method()} ${path(r.url())} (${r.failure()?.errorText ?? '?'})`); });
      page.on('response', (r) => { if (r.status() >= 400) step(`${name} http ${String(r.status())}: ${r.request().method()} ${path(r.url())}`); });
      page.on('console', (m) => { if (m.type() === 'error') step(`${name} console: ${redact(m.text()).slice(0, 160)}`); });
      await page.goto(`${LIVE_BROWSER_PAGE_ORIGIN}/?matchticks=${String(LIVE_BROWSER_MATCH_TICKS)}&ff=netbot#online`);
      pages.push(page);
    }
    const [a, b] = pages as [Page, Page];
    const status = async (p: Page): Promise<string> => (await p.locator('#quickStatus').textContent()) ?? '';
    const wait = async (p: Page, sel: string, ms: number, state: 'visible' | 'attached' = 'visible'): Promise<boolean> => p.locator(sel).waitFor({ state, timeout: ms }).then(() => true, () => false);
    for (const p of pages) if (!(await wait(p, '#quickFind', LIVE_BROWSER_STEP_MS))) { out('Find never appeared'); return 1; }
    await a.locator('#quickFind').click();
    await b.locator('#quickFind').click();
    step('both queued');
    for (const p of pages) if (!(await wait(p, '#quickReady', LIVE_BROWSER_STEP_MS))) { out(`no opponent found: ${redact(await status(p))}`); return 1; }
    step('matched');
    await a.locator('#quickReady').click();
    await b.locator('#quickReady').click();
    for (const p of pages) if (!(await wait(p, '#quickLink', LIVE_BROWSER_STEP_MS, 'attached'))) { out(`arena did not start: ${redact(await status(p))}`); return 1; }
    step('arenas running');
    // Per animation frame, record each character's raw sim x and drawn x (test probe), to count on-screen snaps in the real renderer.
    const SAMPLER = 'window.__frames = []; (function loop() { const xs = window.__TTE__ && window.__TTE__.arena && window.__TTE__.arena.drawnXs && window.__TTE__.arena.drawnXs(); if (xs) window.__frames.push(xs.map(function (x) { return [x.id, x.simX, x.drawnX]; })); requestAnimationFrame(loop); })();';
    for (const p of pages) await p.evaluate(SAMPLER);
    for (const p of pages) if (!(await wait(p, '#quickAgain', LIVE_BROWSER_END_MS))) { out(`match did not end: ${redact(await status(p))}`); step(`at failure: ${recvLine()} (measurement)`); return 1; }
    for (const [name, p] of [['A', a], ['B', b]] as const) {
      const frames = await p.evaluate<FrameSample[][]>('window.__frames || []');
      const j = jumpStats(frames, 30);
      step(`${name} view jumps over ${String(frames.length)} frames: largest raw ${j.rawMax.toFixed(0)} px, drawn ${j.drawnMax.toFixed(0)} px; over 30 px raw ${String(j.rawOver)}, drawn ${String(j.drawnOver)} (measurement, real renderer)`);
    }
    const [ta, tb] = [await status(a), await status(b)];
    step(`ended: ${ta} | ${tb}`);
    const failed = (await Promise.all(pages.map((p) => p.locator('#quickFailure').isVisible()))).some(Boolean);
    if (failed) { out('a failure banner is showing'); return 1; }
    if (!mirrored(ta, tb)) { out('end lines do not mirror'); return 1; }
    for (const l of rateLines(sentA.summary(), sentB.summary(), sentAll.summary())) out(l);
    step(`ok: ${recvLine()}`);
    return 0;
  } finally {
    await browser.close();
    preview.kill('SIGTERM');
  }
}

/** N sequential matches (`--runs`), stopping at the first failure; wall time per run and a summary are measurements. */
export async function main(env: Readonly<Record<string, string | undefined>>, out: (l: string) => void, argv: readonly string[] = []): Promise<number> {
  const args = parseArgs(argv);
  if (typeof args === 'string') { out(args); return 2; }
  const seconds: number[] = [];
  let failures = 0; let rc = 0;
  for (let i = 1; i <= args.runs; i++) {
    out(`== run ${String(i)}`);
    const t = performance.now();
    rc = await runOnce(env, out);
    const s = Math.round((performance.now() - t) / 100) / 10;
    out(`== run ${String(i)} exit ${String(rc)} ${String(s)}s`);
    if (rc === 2) return 2;
    seconds.push(s);
    if (rc !== 0) { failures++; out('STOP on failure'); break; }
    if (i < args.runs) await new Promise((r) => setTimeout(r, LIVE_BROWSER_RUN_GAP_MS));
  }
  out(summaryLine(summarizeRuns(seconds, failures)));
  return rc;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.env, (l) => { process.stdout.write(`${redact(l)}\n`); }, process.argv.slice(2));
}
