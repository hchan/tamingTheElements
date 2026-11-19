/**
 * QA playthrough: drives real Arcade fights through the dev/test `window.__TTE__` hooks and screenshots the beats a
 * manual-stepped or live QA run cannot reach: a super cut-in, a match end (results) and a 2v2 tag swap, at 1280x720
 * (desktop only; edit SIZES for others). Headless only. Output: .scratch/qa/<beat>-<w>x<h>.png.
 * Usage (E2E_PORT 7900-7999 for QA; one browser slot per checkout):
 *   E2E_PORT=7946 corepack pnpm exec tsx tools/ci/browser-slot.ts -- corepack pnpm exec tsx tools/qa/playthrough.ts
 * QA_BASE_URL reuses a running test-mode server instead of starting one. Exit 1 if a beat is not reached.
 * It builds with `--mode test` (tools/ci/e2e-server.ts), the only build that has `__TTE__`. Page code is strings (no DOM lib).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { e2ePort } from '../ci/e2e-port';

const SUPER = 1 << 13;
const INTRO = 91; // round 1 intro ticks (nobody acts before it)
const KO_TO_ROUND_END = 30 + 120 + 60;
const SIZES = [{ width: 1280, height: 720 }]; // desktop only (owner dropped phone and portrait work, 2026-11-18)
const OUT = resolve(process.cwd(), '.scratch/qa');
const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena && window.__TTE__.arena.viewsReady()`;

type Size = { width: number; height: number };
const frames = (p: Page): Promise<unknown> => p.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const step = (p: Page, n: number): Promise<unknown> => p.evaluate(`window.__TTE__.arena.step(${String(n)})`);
const chars = (p: Page, team: number): Promise<{ id: number }[]> =>
  p.evaluate<{ id: number }[]>(`window.__TTE__.arena.characters().filter((c) => c.team === ${String(team)})`);

async function waitUrl(url: string, server: ChildProcess | undefined): Promise<void> {
  for (let i = 0; i < 480; i++) {
    if (server && server.exitCode !== null) throw new Error(`preview server exited (${String(server.exitCode)})`);
    if (await fetch(url).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no server at ${url}`);
}

async function openFight(page: Page, size: Size, base: string, team: 1 | 2): Promise<void> {
  await page.setViewportSize(size);
  await page.goto(`${base}/?manual=1&seed=7&ff=arcade#arcade`);
  if (team === 2) {
    await page.getByLabel('Team').selectOption('2');
    await page.getByLabel('Your partner (2v2)').selectOption('pax');
  }
  await page.getByLabel('Your race').selectOption('sindarosa');
  await page.getByLabel('AI race').selectOption('fiara');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await step(page, INTRO);
}

/** Places the fighters apart, fills the player's bar, presses the super and (when `ko`) leaves the foe at 1 HP so it dies. */
async function superOn(page: Page, ko: boolean, ticks: number): Promise<void> {
  const [me] = await chars(page, 0);
  const [foe] = await chars(page, 1);
  if (!me || !foe) throw new Error('both fighters must be in the arena');
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.place(${String(me.id)}, 300, 360, 0); a.place(${String(foe.id)}, 900, 360, 4); a.setMeter(0, 1000); ${ko ? `a.setHp(${String(foe.id)}, 1);` : ''} a.step(1, [${String(SUPER)}, 0]); a.step(${String(ticks)}); })()`);
}

/** Forces super KOs (retrying, as a super pressed in recovery is ignored) until the player has `wins` round wins or the results are up. */
async function winRound(page: Page, wins: number): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await superOn(page, true, 90 + KO_TO_ROUND_END);
    if (await page.locator('#arcadeResults').isVisible()) return;
    const r = await page.evaluate<{ won: number[] } | undefined>(`window.__TTE__.arena.rounds()`);
    if ((r?.won[0] ?? 0) >= wins) return;
    await step(page, 60);
  }
  throw new Error(`round ${String(wins)} not won`);
}

async function run(page: Page, base: string): Promise<string[]> {
  const shots: string[] = [];
  const shot = async (name: string, size: Size): Promise<void> => {
    const path = `${OUT}/${name}-${String(size.width)}x${String(size.height)}.png`;
    await page.screenshot({ path });
    shots.push(path);
  };
  for (const size of SIZES) {
    // 1) Super cut-in, then the match end (two rounds won by forced super KOs) in a 1v1.
    await openFight(page, size, base, 1);
    await superOn(page, false, 5);
    await page.waitForFunction(`window.__TTE__.arena.superFx().then((f) => !!f)`, undefined, { timeout: 15_000 });
    await frames(page);
    await shot('super-cutin', size);
    await step(page, 120); // let the player's super recovery end
    await winRound(page, 1);
    await step(page, 71); // round 2's intro
    await winRound(page, 2);
    await page.locator('#arcadeResults').waitFor({ timeout: 15_000 });
    await frames(page);
    await shot('match-end', size);
    // 2) Tag swap in a 2v2 (the 3 key is the tag; live ticks let the keyboard agent act).
    await openFight(page, size, base, 2);
    await page.keyboard.down('Digit3');
    await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
    await page.keyboard.up('Digit3');
    await frames(page);
    const tag = await page.evaluate<{ call: string } | undefined>(`window.__TTE__.arena.tag()`);
    if (tag?.call !== 'TAG!') throw new Error(`tag swap not reached at ${String(size.width)}x${String(size.height)}: ${JSON.stringify(tag)}`);
    await shot('tag-swap', size);
  }
  return shots;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  let server: ChildProcess | undefined;
  let base = process.env['QA_BASE_URL'] ?? '';
  if (!base) {
    const port = e2ePort(process.cwd());
    server = spawn('corepack', ['pnpm', 'exec', 'tsx', 'tools/ci/e2e-server.ts', port], { stdio: ['pipe', 'inherit', 'inherit'] });
    base = `http://localhost:${port}`;
  }
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    await waitUrl(base, server);
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const s of await run(page, base)) console.log(`shot: ${s}`);
    if (errors.length > 0) throw new Error(`page errors: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
    server?.kill('SIGTERM');
  }
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
