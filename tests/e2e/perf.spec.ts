// Performance probes (docs/PERFORMANCE.md). The numbers are attached to the report; the asserted bounds are deliberately very
// generous (SwiftShader is software rendering, CI machines are shared) so these catch only order-of-magnitude regressions.
import { expect, test } from '@playwright/test';

const READY = 'window.__TTE__ && window.__TTE__.ready === true';
const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`;

interface FrameStats {
  frames: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  /** Frames longer than 100 ms (a rough "jank" count). */
  longFrames: number;
  /** Browser long tasks (>50 ms main-thread blocks) seen during the run. */
  longTasks: number;
}

// Page-side code is a string because tsconfig.node has no DOM lib. Each frame steps the sim once (like the real 50 Hz driver
// at 60 fps), then records the rAF-to-rAF delta, so the sim and the render both contribute to the measured frame time.
const FRAME_PROBE = (frames: number): string => `new Promise((resolve) => {
  let longTasks = 0;
  const obs = typeof PerformanceObserver === 'function' ? new PerformanceObserver((l) => { longTasks += l.getEntries().length; }) : null;
  try { obs && obs.observe({ entryTypes: ['longtask'] }); } catch (e) {}
  const deltas = [];
  let last = 0;
  const RIGHT = 8, PRIMARY = 16;
  const tick = (now) => {
    if (last) deltas.push(now - last);
    last = now;
    window.__TTE__.arena.step(1, [deltas.length % 7 < 4 ? RIGHT | PRIMARY : PRIMARY, 0]);
    if (deltas.length < ${String(frames)}) requestAnimationFrame(tick);
    else {
      obs && obs.disconnect();
      const sorted = deltas.slice().sort((a, b) => a - b);
      resolve({
        frames: deltas.length,
        avgMs: deltas.reduce((a, b) => a + b, 0) / deltas.length,
        p95Ms: sorted[Math.floor(sorted.length * 0.95)],
        maxMs: sorted[sorted.length - 1],
        longFrames: deltas.filter((d) => d > 100).length,
        longTasks,
      });
    }
  };
  requestAnimationFrame(tick);
})`;

test('stepped battle frame time under SwiftShader stays within a very generous bound', async ({ page }, testInfo) => {
  await page.goto('/?ff=arenaDemo&manual=1');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  // Warm up shader compilation and texture upload so they do not count as frame time.
  await page.evaluate(`window.__TTE__.arena.step(30)`);

  const stats = await page.evaluate<FrameStats>(FRAME_PROBE(180));
  await testInfo.attach('frame-time.json', { body: JSON.stringify(stats, null, 2), contentType: 'application/json' });
  console.info(`frame time (SwiftShader): ${JSON.stringify(stats)}`);

  expect(stats.frames).toBe(180);
  // A healthy software-rendered run is far below these. They fail only if frames take ~a quarter second on average
  // (the renderer or sim is broken), never on ordinary CI slowness.
  expect(stats.avgMs).toBeLessThan(250);
  expect(stats.longFrames).toBeLessThan(stats.frames / 2);
});

test('menu loads without Phaser: time to interactive and transferred bytes', async ({ page }, testInfo) => {
  const urls: string[] = [];
  page.on('response', (r) => urls.push(r.url()));

  await page.goto('/');
  await page.waitForFunction(READY);
  await page.locator('#menu').waitFor({ state: 'visible' });

  const timing = await page.evaluate<{ tti: number; transferred: number; resources: string[] }>(`(() => {
    const res = performance.getEntriesByType('resource');
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      tti: performance.now(),
      transferred: res.reduce((a, r) => a + r.transferSize, 0) + (nav ? nav.transferSize : 0),
      resources: res.map((r) => r.name),
    };
  })()`);
  await testInfo.attach('menu-load.json', { body: JSON.stringify({ ...timing, requests: urls.length }, null, 2), contentType: 'application/json' });
  console.info(`menu load: tti ${timing.tti.toFixed(0)} ms, ${String(timing.transferred)} B transferred, ${String(urls.length)} requests`);

  expect(urls.filter((u) => /phaser/.test(u))).toEqual([]);
  expect(timing.resources.filter((u) => /phaser/.test(u))).toEqual([]);
  // Measured ~36 KB (the preview server gzips). The Phaser chunk alone is ~350 KB gzip, so 150 KB means "Phaser leaked into
  // the first load" long before it means "the menu grew"; a real menu growth is caught by size:check.
  expect(timing.transferred).toBeLessThan(150_000);
  // Menu visible and interactive well inside a very generous bound for a shared machine.
  expect(timing.tti).toBeLessThan(10_000);
});

test('Phaser is downloaded only when play starts', async ({ page }) => {
  const urls: string[] = [];
  page.on('response', (r) => urls.push(r.url()));
  await page.goto('/?ff=play');
  await page.locator('#game canvas').waitFor();
  expect(urls.some((u) => /phaser-[^/]*\.js/.test(u))).toBe(true);
});
