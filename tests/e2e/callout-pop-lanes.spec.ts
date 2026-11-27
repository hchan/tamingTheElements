import { mkdirSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { benchRects, popCeil } from '../../src/game/fx/pop-lanes';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// CALLOUT-POP-1: an Arcade call-out (ROOTED, CHARGE! ...) keeps clear of the white damage pop over the same fighter, at every age of the
// pop, stays under the dark scrim and the status chips, and slides sideways before it would hide under them. Manual stepping holds view
// effects, so shockSeek(ms) places the pops at a chosen age. Page-side code is passed as strings (tsconfig.node has no DOM lib).
// SHOT_DIR=<dir> saves the screenshots there (headless), else they go to the test output.
const CHARGE = 1 << 15;
const SNAG = 16;
const INTRO = 91;
const GAP = 7;
// The demo is 2v2, so a bench row (tag pill and portraits, cbdb2e9e) sits under the scrim and lifts the call-out ceiling to its bottom; the
// ceiling is the same popCeil the game uses over the chips plus these rects (the extent of one benched hero per team covers the call-out x).
const BENCH = benchRects([1, 1]);
const ceilingFor = (c: Box, chips: Box[][]): number => popCeil([...chips, ...BENCH], c.x, c.x + c.w);
const SHOT_DIR = process.env['SHOT_DIR'];

interface Box { x: number; y: number; w: number; h: number }
interface Overlays { pops: Box[]; callouts: Box[]; hudCallouts: Box[]; chips: Box[][]; frame: Box }

const VIEWS = [
  { name: '1280x720', size: { width: 1280, height: 720 } },
] as const;

const raf2 = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const overlays = (page: Page): Promise<Overlays> => page.evaluate<Overlays>(`window.__TTE__.arena.overlays()`);

/** Space between two rects along the axis where they are furthest apart (negative: they overlap on both axes). */
const gapBetween = (a: Box, b: Box): number => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
const apart = (a: Box, b: Box): boolean => gapBetween(a, b) >= GAP;
const near = (a: Box, b: Box, d: number): boolean => gapBetween(a, b) < d;

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });
  await page.locator('#game canvas').screenshot({ path: SHOT_DIR ? `${SHOT_DIR}/${name}.png` : info.outputPath(`${name}.png`) });
}

/**
 * CALLOUT-POP-2 eases a call-out up to its lane in real time (tau 35 ms, about 100 ms to 95%), so two frames after a seek it is still a few
 * px short of the target the solver cleared. The clearance claim is about the target, so read the overlays once the rects stop moving.
 */
async function settledOverlays(page: Page): Promise<Overlays> {
  let ov = await overlays(page);
  for (let i = 0; i < 15; i++) {
    await raf2(page);
    const next = await overlays(page);
    const still = JSON.stringify(next.callouts) === JSON.stringify(ov.callouts);
    ov = next;
    if (still) break;
  }
  return ov;
}

async function settleCamera(page: Page): Promise<void> {
  let last = '';
  for (let i = 0; i < 40; i++) {
    const cam = JSON.stringify(await page.evaluate(`window.__TTE__.arena.camera()`));
    if (cam === last) return;
    last = cam;
    await raf2(page);
  }
}

async function openDemo(page: Page, ys: [number, number] = [380, 380]): Promise<number> {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  return page.evaluate<number>(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(INTRO)});
    const [me, foe] = a.characters();
    a.place(me.id, 700, ${String(ys[0])}, 0);
    a.place(foe.id, 780, ${String(ys[1])}, 4);
    return foe.id;
  })()`);
}

async function hit(page: Page, foe: number, cmd: number, max = 20): Promise<void> {
  const hp = (): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.id === ${String(foe)}).hp`);
  const start = await hp();
  for (let i = 0; i < max && (await hp()) === start; i++) await page.evaluate(`window.__TTE__.arena.step(1, [${String(cmd)}, 0])`);
  expect(await hp()).toBeLessThan(start);
  await raf2(page);
}

/** Snag run: pick the two races from the menu, root the foe, then hit it so a pop rides over the ROOTED call-out. */
async function rootedWithPop(page: Page, reduced: boolean): Promise<void> {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('treenoc');
  await page.getByLabel('AI race').selectOption('sindarosa');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  const card = page.getByRole('button', { name: 'Got it' });
  if (await card.isVisible()) await card.click();
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 700, 380, 0); a.place(f.id, 780, 380, 4); })()`);
  await raf2(page);
  // The Snag itself hurts (a pop) and roots (the ROOTED call-out), so both ride over the same fighter; poll tick by tick, the call-out is short.
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(SNAG)}, 0])`);
  let rooted = false;
  for (let i = 0; i < 30 && !rooted; i++) {
    await page.evaluate(`window.__TTE__.arena.step(1)`);
    await raf2(page);
    rooted = ((await page.evaluate<{ pops: string[] } | undefined>(`window.__TTE__.arena.defence()`))?.pops ?? []).includes('ROOTED');
  }
  expect(rooted, 'the Snag rooted the foe').toBe(true);
  await raf2(page);
}

interface Sample { ov: Overlays; ms: number; ticks: number }

/** After the spawn, steps 0, 10, 20 and 30 ticks and at each seeks the pops to 0, 90, 400 and 600 ms. */
async function sweep(page: Page, each: (s: Sample) => Promise<void> | void, settle = false): Promise<void> {
  let ticks = 0;
  for (const to of [0, 10, 20, 30]) {
    if (to > ticks) await page.evaluate(`window.__TTE__.arena.step(${String(to - ticks)})`);
    ticks = to;
    for (const ms of [0, 90, 400, 600]) {
      await page.evaluate(`window.__TTE__.arena.shockSeek(${String(ms)})`);
      await raf2(page);
      await each({ ov: settle ? await settledOverlays(page) : await overlays(page), ms, ticks });
    }
  }
}

function expectApart(s: Sample, what: string): void {
  for (const c of s.ov.callouts) for (const p of s.ov.pops) expect(apart(c, p), `${what}: call-out ${JSON.stringify(c)} touches pop ${JSON.stringify(p)} at ${String(s.ticks)} ticks, ${String(s.ms)} ms`).toBe(true);
}

/** At least one pop and one call-out within 110 px at the first sample, so a pass is not vacuous. */
function expectNonVacuous(s: Sample): void {
  expect(s.ov.pops.length, 'a white pop is up').toBeGreaterThanOrEqual(1);
  expect(s.ov.callouts.length, 'a call-out is up').toBeGreaterThanOrEqual(1);
  expect(s.ov.callouts.some((c) => s.ov.pops.some((p) => near(c, p, 110))), 'a call-out and a pop are close').toBe(true);
}

for (const v of VIEWS) {
  test.describe(`call-outs clear of pops, ${v.name}`, () => {
    test.use({ viewport: v.size, deviceScaleFactor: 1 });
    const tag = v.name.replace(/\W+/g, '-');

    test('S3: CHARGE! keeps clear of the white pop on the foe at every age', async ({ page }, info) => {
      test.setTimeout(180_000); // settled reads add real frames per sample; the PC is slower than the Mac
      const errors = collectErrors(page);
      const foe = await openDemo(page);
      await hit(page, foe, CHARGE);
      await settleCamera(page);
      let first = true;
      const shots: Sample[] = [];
      await sweep(page, async (s) => {
        if (first) {
          first = false;
          await shot(page, info, `s3-charge-${tag}-0ms`);
          expectNonVacuous(s);
        }
        if (s.ticks === 0 && s.ms === 400) await shot(page, info, `s3-charge-${tag}-400ms`);
        shots.push(s);
      }, true);
      for (const s of shots) expectApart(s, 'S3');
      expect(errors).toEqual([]);
    });

    test('S1: ROOTED stays clear of a pop on the same fighter', async ({ page }, info) => {
      test.setTimeout(180_000);
      const errors = collectErrors(page);
      await rootedWithPop(page, false);
      await settleCamera(page);
      const seen: Sample[] = [];
      let first = true;
      await sweep(page, async (s) => {
        if (first) {
          first = false;
          await shot(page, info, `s1-rooted-${tag}-0ms`);
          expectNonVacuous(s);
        }
        seen.push(s);
      }, true);
      for (const s of seen) expectApart(s, 'S1');
      expect(errors).toEqual([]);
    });

    test('S5a: a call-out over a back-row fighter stays under the scrim and the chips', async ({ page }, info) => {
      const errors = collectErrors(page);
      const foe = await openDemo(page, [200, 200]);
      await hit(page, foe, CHARGE);
      // Chips for both teams, granted once the charge has landed (a stun would stop it).
      await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.grantStatus(m.id, 1, 900); a.grantStatus(m.id, 3, 900); a.grantStatus(f.id, 10, 900); a.grantStatus(f.id, 11, 900); })()`);
      await raf2(page);
      await settleCamera(page);
      let pinned = Infinity;
      let seen = 0;
      let first = true;
      await sweep(page, async (s) => {
        if (first) {
          first = false;
          await shot(page, info, `s5a-ceiling-${tag}`);
        }
        s.ov.hudCallouts.forEach((c) => {
          const ceil = ceilingFor(c, s.ov.chips);
          seen++;
          pinned = Math.min(pinned, c.y - ceil);
          expect(c.y, `call-out top ${String(c.y)} above its ceiling ${String(ceil)}`).toBeGreaterThanOrEqual(ceil - 1);
        });
      });
      expect(seen).toBeGreaterThan(0);
      expect(pinned, 'scenario no longer reaches the ceiling').toBeLessThanOrEqual(2);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('call-outs slide sideways at the ceiling, 1280x720', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  test('S5b: pinned under the scrim, a call-out slides clear of the pop inside the margins', async ({ page }, info) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    const foe = await openDemo(page, [200, 200]);
    await hit(page, foe, CHARGE);
    await settleCamera(page);
    const seen: Sample[] = [];
    let first = true;
    await sweep(page, async (s) => {
      if (first) {
        first = false;
        await shot(page, info, 's5b-slide-0ms');
      }
      seen.push(s);
    }, true);
    let pinned = Infinity;
    let slid = false;
    for (const s of seen) {
      expectApart(s, 'S5b');
      for (const c of s.ov.hudCallouts) {
        const ceil = ceilingFor(c, s.ov.chips);
        pinned = Math.min(pinned, c.y - ceil);
        expect(c.y).toBeGreaterThanOrEqual(ceil - 1);
        expect(c.x).toBeGreaterThanOrEqual(s.ov.frame.x + 16 - 1);
        expect(c.x + c.w).toBeLessThanOrEqual(s.ov.frame.x + s.ov.frame.w - 16 + 1);
      }
      for (const c of s.ov.callouts) if (Math.abs(c.x + c.w / 2 - 740) > 4) slid = true;
    }
    expect(pinned, 'scenario no longer reaches the ceiling').toBeLessThanOrEqual(2);
    expect(slid, 'the call-out never slid sideways').toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('reduced motion', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  test('S4: no white pop, call-outs hold still and the grey numbers keep clear of them', async ({ page }, info) => {
    const errors = collectErrors(page);
    await rootedWithPop(page, true);
    await settleCamera(page);
    expect((await page.evaluate<{ pops: number } | undefined>(`window.__TTE__.arena.shockFx()`))?.pops ?? 0).toBe(0);
    let bottoms: number[] | undefined;
    for (let i = 0; i < 8; i++) {
      await page.evaluate(`window.__TTE__.arena.step(2)`);
      await raf2(page);
      const ov = await overlays(page);
      const now = ov.callouts.map((c) => c.y + c.h);
      if (bottoms?.length === now.length) expect(now).toEqual(bottoms);
      bottoms = now;
      const fx = await page.evaluate<{ numberBoxes: Box[] } | undefined>(`window.__TTE__.arena.fx()`);
      for (const n of fx?.numberBoxes ?? []) for (const c of ov.hudCallouts) expect(gapBetween(n, c), `grey number ${JSON.stringify(n)} on call-out ${JSON.stringify(c)}`).toBeGreaterThanOrEqual(0);
    }
    expect(bottoms?.length ?? 0).toBeGreaterThan(0);
    await shot(page, info, 's4-reduced');
    expect(errors).toEqual([]);
  });
});
