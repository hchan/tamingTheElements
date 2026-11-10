// Frame-pacing probe (docs/VISUAL-QA.md): a REAL-TIME (not manual) bot-vs-bot battle with requestAnimationFrame deltas recorded
// for 10 s. CI runs SwiftShader (software WebGL), so the numbers are far worse than a real GPU and the gates below are very
// generous; they catch only a frozen or collapsing renderer. Real-GPU smoothness MUST be checked on a real machine, for
// example with the live overlay: open the dev or test build with `?ff=fps`.
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR, collectErrors } from './support';

const DURATION_MS = 10_000;
const TARGET_MS = 1000 / 60;

interface Pacing {
  frames: number;
  durationMs: number;
  avgFps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  longFramesOver50ms: number;
  /** Frames that should have been shown at 60 Hz but were not, as a share of expected frames. */
  droppedFrameRatio: number;
  simTicksAdvanced: number;
}

const PROBE = `new Promise((resolve) => {
  const deltas = [];
  const t0 = performance.now();
  const tick0 = window.__TTE__.arena.tick;
  let last = 0;
  const tick = (now) => {
    if (last) deltas.push(now - last);
    last = now;
    if (now - t0 < ${String(DURATION_MS)}) requestAnimationFrame(tick);
    else resolve({ deltas, durationMs: now - t0, ticks: window.__TTE__.arena.tick - tick0 });
  };
  requestAnimationFrame(tick);
})`;

const pct = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
const r1 = (n: number): number => Math.round(n * 10) / 10;

test('real-time battle frame pacing is recorded and not catastrophic', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/?ff=arenaDemo,fps&seed=7'); // no `manual`: the driver runs on the real clock
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(`window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`);
  await page.waitForTimeout(1500); // shader compilation and texture upload are not frame pacing
  const raw = await page.evaluate<{ deltas: number[]; durationMs: number; ticks: number }>(PROBE);
  const sorted = raw.deltas.slice().sort((a, b) => a - b);
  const expected = raw.durationMs / TARGET_MS;
  const shown = raw.deltas.length;
  const stats: Pacing = {
    frames: shown,
    durationMs: Math.round(raw.durationMs),
    avgFps: r1((shown / raw.durationMs) * 1000),
    p50Ms: r1(pct(sorted, 0.5)),
    p95Ms: r1(pct(sorted, 0.95)),
    p99Ms: r1(pct(sorted, 0.99)),
    maxMs: r1(sorted[sorted.length - 1] ?? 0),
    longFramesOver50ms: raw.deltas.filter((d) => d > 50).length,
    droppedFrameRatio: Math.round(Math.max(0, 1 - shown / expected) * 1000) / 1000,
    simTicksAdvanced: raw.ticks,
  };
  const report = {
    note: 'Software rendering (SwiftShader). NOT representative of a real GPU; check smoothness on a real machine with ?ff=fps.',
    renderer: 'swiftshader',
    stats,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'pacing.json'), `${JSON.stringify(report, null, 2)}\n`);
  await testInfo.attach('pacing.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  console.info(`frame pacing (SwiftShader, ${String(DURATION_MS / 1000)} s real time): ${JSON.stringify(stats)}`);
  testInfo.annotations.push({ type: 'pacing', description: JSON.stringify(stats) });

  expect(shown).toBeGreaterThan(30); // the renderer is alive (at least 3 fps)
  expect(stats.p50Ms).toBeLessThan(250);
  expect(stats.simTicksAdvanced).toBeGreaterThan(200); // the 50 Hz sim kept advancing in real time (500 expected)
  expect(errors).toEqual([]);
});
