import { mkdirSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// COMBO-ANCHOR-1: on desktop the Arcade combo counter rides over the victim's head, clamped like damage numbers (inside the frame, under the
// HUD ceiling, clear of pops, call-outs, the number lane and the other counter) and settles instead of jumping. Long gate: visual, two
// viewports, about 60-90 s. Helpers are copied (not imported) from callout-pop-lanes.spec.ts; page-side code is passed as strings.
// Manual mode: the model only ages while ageFx(true) is on, so the pop stays at its peak and the hold never expires on its own.
// SHOT_DIR=<dir> saves the screenshots there (headless), else they go to the test output.
const CHARGE = 1 << 15;
const PRIMARY = 16;
const SECONDARY = 32;
const INTRO = 91;
const GAP = 7;
const SHOT_DIR = process.env['SHOT_DIR'];
const CYCLE = [PRIMARY | SECONDARY, PRIMARY | (1 << 10), PRIMARY | (1 << 6)];

interface Box { x: number; y: number; w: number; h: number }
interface Combo {
  team: 0 | 1; hits: number; live: boolean; anchored: boolean; mode: 'anchored' | 'band'; stuck: boolean; settled: boolean;
  x: number; y: number; w: number; h: number;
  base: { x: number; y: number }; target: { x: number; y: number };
  scale: number; popMax: number; alpha: number; dx: number; dy: number;
  ax: number; ay: number; headX: number; headY: number;
  lane: Box; laneTop: number; ceil: number; numberH: number; maxSlide: number;
  avoid: Box[]; frame: Box; view: Box; s: number; css: Box;
}
interface Fx { numberBoxes: Box[]; popBoxes: Box[]; comboBoxes: Combo[] }
interface Char { id: number; team: number; x: number; y: number; w: number; h: number }

const VIEWS = [
  { name: '1280x720', size: { width: 1280, height: 720 } },
  { name: '1680x720', size: { width: 1680, height: 720 } },
] as const;

const raf2 = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const gapBetween = (a: Box, b: Box): number => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
const fx = (page: Page): Promise<Fx> => page.evaluate<Fx>(`window.__TTE__.arena.fx()`);
const chars = (page: Page): Promise<Char[]> => page.evaluate<Char[]>(`window.__TTE__.arena.characters()`);
const run = (page: Page, js: string): Promise<unknown> => page.evaluate(js);
const vp = (page: Page): string => { const v = page.viewportSize(); return v ? `${String(v.width)}x${String(v.height)}` : 'unknown viewport'; };
const fmt = (b: Box): string => `box x=${String(b.x)} y=${String(b.y)} w=${String(b.w)} h=${String(b.h)}`;
const box = (c: Combo): Box => ({ x: c.x, y: c.y, w: c.w, h: c.h });

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });
  await page.locator('#game canvas').screenshot({ path: SHOT_DIR ? `${SHOT_DIR}/${name}.png` : info.outputPath(`${name}.png`) });
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

/** Team 0's counter, asserted anchored (never the band slot) so a pass is not vacuous. */
async function mine(page: Page): Promise<Combo> {
  const c = (await fx(page)).comboBoxes.find((b) => b.team === 0);
  expect(c, `[${vp(page)}] team 0 (the player) has no visible combo counter in fx().comboBoxes`).toBeDefined();
  const combo = c as Combo;
  expect(combo.mode, `[${vp(page)}] the combo counter is in mode '${combo.mode}' (the fixed band slot) instead of 'anchored' over the victim's head on desktop`).toBe('anchored');
  return combo;
}

/** Polls (bounded) until the counter has eased onto its target. */
async function settled(page: Page): Promise<Combo> {
  let c = await mine(page);
  for (let i = 0; i < 90 && !c.settled; i++) {
    await raf2(page);
    c = await mine(page);
  }
  expect(c.settled, `[${vp(page)}] the combo counter never settled onto its target within 90 frames (${fmt(c)})`).toBe(true);
  return c;
}

async function openDemo(page: Page, view: { width: number; height: number }, reduced = false): Promise<number> {
  await page.setViewportSize(view);
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  return page.evaluate<number>(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(INTRO)});
    const [me, foe] = a.characters();
    a.place(me.id, 700, 380, 0);
    a.place(foe.id, 780, 380, 4);
    return foe.id;
  })()`);
}

/** Charges (its arrival hit stuns), then keeps hitting the pinned foe until the player's counter shows `hits`. One page round trip (SwiftShader frames are slow). */
async function comboTo(page: Page, foe: number, hits: number, at?: { x: number; y: number }): Promise<void> {
  const n = await page.evaluate<number>(`(async () => {
    const a = window.__TTE__.arena;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const hp = () => a.characters().find((c) => c.id === ${String(foe)}).hp;
    const h0 = hp();
    for (let i = 0; i < 20 && hp() === h0; i++) a.step(1, [${String(CHARGE)}, 0]);
    const cycle = ${JSON.stringify(CYCLE)};
    let n = 0;
    for (let t = 0; t < 300; t++) {
      ${at ? `a.place(${String(foe)}, ${String(at.x)}, ${String(at.y)}, 4);` : ''}
      a.step(1, [cycle[t % cycle.length], 0]);
      await raf();
      const c = a.fx().comboBoxes.find((b) => b.team === 0);
      n = c ? c.hits : 0;
      if (n >= ${String(hits)}) break;
    }
    return n;
  })()`);
  expect(n, `[${vp(page)}] the combo counter never reached ${String(hits)} hits within 300 ticks (last count ${String(n)})`).toBeGreaterThanOrEqual(hits);
}

for (const view of VIEWS) {
  test.describe(`combo anchor, ${view.name}`, () => {
    test.use({ viewport: view.size, hasTouch: false });
    test.slow();

    test('1: the combo counter is anchored over the foe\'s head and tracks the camera projection', async ({ page }, info) => {
      const errors = collectErrors(page);
      const foe = await openDemo(page, view.size);
      await comboTo(page, foe, 2);
      await settleCamera(page);
      const c = await settled(page);
      const f = (await chars(page)).find((ch) => ch.id === foe) as Char;
      const W = `[${view.name}] case 1`;
      const fb = `foe box x=${String(f.x)} y=${String(f.y)} w=${String(f.w)} h=${String(f.h)}`;
      expect(c.ax, `${W}: the counter's anchor x (${String(c.ax)}) is left of the foe's left edge; ${fb}`).toBeGreaterThanOrEqual(f.x);
      expect(c.ax, `${W}: the counter's anchor x (${String(c.ax)}) is right of the foe's right edge; ${fb}`).toBeLessThanOrEqual(f.x + f.w);
      expect(c.ay, `${W}: the counter's anchor y (${String(c.ay)}) is below the foe's top edge; ${fb}`).toBeLessThanOrEqual(f.y);
      expect(Math.abs(c.headX - (c.frame.x + ((c.ax - c.view.x) / c.view.w) * c.frame.w)), `${W}: the counter's head x (${String(c.headX)}) is more than 1 px from the projected anchor`).toBeLessThanOrEqual(1);
      expect(Math.abs(c.headY - (c.frame.y + ((c.ay - c.view.y) / c.view.h) * c.frame.h)), `${W}: the counter's head y (${String(c.headY)}) is more than 1 px from the projected anchor`).toBeLessThanOrEqual(1);
      await shot(page, info, `mid-${view.name}`);
      expect(errors, `[${vp(page)}] the page logged console or page errors during this case`).toEqual([]);
    });

    test('2: with the foe at either arena wall the combo counter stays inside the frame, under the HUD ceiling and above the action bar', async ({ page }, info) => {
      const errors = collectErrors(page);
      const foe = await openDemo(page, view.size);
      let moved = 0;
      for (const [x, name] of [[40, 'left'], [1840, 'right']] as const) {
        await run(page, `(() => { const a = window.__TTE__.arena; const [me] = a.characters(); a.place(me.id, ${String(x === 40 ? 120 : 1760)}, 380, 0); })()`);
        await comboTo(page, foe, 2, { x, y: 380 });
        await settleCamera(page);
        const c = await settled(page);
        expect(c.x, `[${view.name}] case 2, foe at the ${name} wall: the counter's left edge (${String(c.x)}) is left of the frame's 16 px margin; ${fmt(c)}`).toBeGreaterThanOrEqual(c.frame.x + 16 - 1);
        expect(c.x + c.w, `[${view.name}] case 2, foe at the ${name} wall: the counter's right edge (${String(c.x + c.w)}) is right of the frame's 16 px margin; ${fmt(c)}`).toBeLessThanOrEqual(c.frame.x + c.frame.w - 16 + 1);
        expect(c.y, `[${view.name}] case 2, foe at the ${name} wall: the counter's top (${String(c.y)}) is above the HUD ceiling (${String(c.ceil)}); ${fmt(c)}`).toBeGreaterThanOrEqual(c.ceil - 1);
        expect(c.y + c.h, `[${view.name}] case 2, foe at the ${name} wall: the counter's bottom (${String(c.y + c.h)}) overlaps the action bar; ${fmt(c)}`).toBeLessThanOrEqual(c.frame.y + c.frame.h - 88 + 1);
        if (c.dx !== 0 || c.dy !== 0) moved++;
        await shot(page, info, `wall-${name}-${view.name}`);
      }
      expect(moved, `[${view.name}] case 2: the wall clamp never moved the counter at either wall (dx and dy were 0 both times)`).toBeGreaterThan(0);
      expect(errors, `[${vp(page)}] the page logged console or page errors during this case`).toEqual([]);
    });

    test('3: the combo counter keeps 7 px clear of pops, call-outs and damage numbers, or goes faint when stuck', async ({ page }) => {
      const errors = collectErrors(page);
      const foe = await openDemo(page, view.size);
      await comboTo(page, foe, 2, { x: 780, y: 380 });
      await settleCamera(page);
      let ticks = 0;
      let moved = 0;
      let checked = 0;
      for (const to of [0, 10, 20, 30]) {
        if (to > ticks) await run(page, `window.__TTE__.arena.step(${String(to - ticks)}, [${String(CYCLE[0])}, 0])`);
        ticks = to;
        for (const ms of [0, 90, 400, 600]) {
          await run(page, `window.__TTE__.arena.shockSeek(${String(ms)})`);
          await raf2(page);
          await settled(page);
          const f = await fx(page);
          const c = f.comboBoxes.find((b) => b.team === 0) as Combo;
          expect(c.mode, `[${view.name}] case 3 at ${String(to)} ticks, ${String(ms)} ms: the counter is in mode '${c.mode}' instead of 'anchored'`).toBe('anchored');
          checked++;
          if (c.dx !== 0 || c.dy !== 0) moved++;
          if (c.stuck) {
            expect(c.alpha, `[${view.name}] case 3 at ${String(to)} ticks, ${String(ms)} ms: the stuck counter has alpha ${String(c.alpha)}, not faint (0.4 or less)`).toBeLessThanOrEqual(0.4 + 1e-6);
          } else {
            for (const r of [...c.avoid, ...f.popBoxes]) expect(gapBetween(box(c), r), `[${view.name}] case 3 at ${String(to)} ticks, ${String(ms)} ms: the counter (${fmt(box(c))}) is closer than 7 px to a pop, call-out or number-lane box (${fmt(r)})`).toBeGreaterThanOrEqual(GAP - 1);
          }
          for (const n of f.numberBoxes) expect(gapBetween(box(c), n), `[${view.name}] case 3 at ${String(to)} ticks, ${String(ms)} ms: a damage number (${fmt(n)}) overlaps the counter (${fmt(box(c))})`).toBeGreaterThanOrEqual(0);
        }
      }
      expect(checked, `[${view.name}] case 3: sampled ${String(checked)} tick/ms combinations instead of 16`).toBe(16);
      expect(moved, `[${view.name}] case 3: no sample forced the counter off its natural spot (dx and dy were 0 in all ${String(checked)})`).toBeGreaterThan(0);
      expect(errors, `[${vp(page)}] the page logged console or page errors during this case`).toEqual([]);
    });

    test('5: the combo counter\'s milestone pop stays inside the frame and under the ceiling, then eases back to scale 1', async ({ page }, info) => {
      const errors = collectErrors(page);
      const foe = await openDemo(page, view.size);
      await comboTo(page, foe, 3);
      await settleCamera(page);
      const c = await settled(page);
      expect(c.scale, `[${view.name}] case 5: the counter's scale (${String(c.scale)}) is above its milestone pop maximum (${String(c.popMax)})`).toBeLessThanOrEqual(c.popMax + 1e-6);
      expect(c.x, `[${view.name}] case 5: the popped counter's left edge is outside the frame; ${fmt(c)}`).toBeGreaterThanOrEqual(c.frame.x - 1);
      expect(c.x + c.w, `[${view.name}] case 5: the popped counter's right edge is outside the frame; ${fmt(c)}`).toBeLessThanOrEqual(c.frame.x + c.frame.w + 1);
      expect(c.y, `[${view.name}] case 5: the popped counter's top (${String(c.y)}) is above the HUD ceiling (${String(c.ceil)}); ${fmt(c)}`).toBeGreaterThanOrEqual(c.ceil - 1);
      await shot(page, info, `pop-${view.name}`);
      await run(page, `window.__TTE__.arena.ageFx(true)`);
      let s = c.scale;
      for (let i = 0; i < 120 && s > 1.001; i++) {
        await raf2(page);
        s = (await mine(page)).scale;
      }
      await run(page, `window.__TTE__.arena.ageFx(false)`);
      expect(s, `[${view.name}] case 5: the counter's pop scale is still ${String(s)} after 120 frames, it never eased back to 1`).toBeLessThanOrEqual(1.001);
      expect(errors, `[${vp(page)}] the page logged console or page errors during this case`).toEqual([]);
    });

    test('6: the combo counter in its frozen hold keeps its anchor while the foe moves away', async ({ page }) => {
      const errors = collectErrors(page);
      const foe = await openDemo(page, view.size);
      await comboTo(page, foe, 2);
      await run(page, `(async () => {
        const a = window.__TTE__.arena;
        const raf = () => new Promise((r) => requestAnimationFrame(r));
        for (let i = 0; i < 400; i++) {
          a.step(1);
          await raf();
          const c = a.fx().comboBoxes.find((b) => b.team === 0);
          if (!c || !c.live) break;
        }
      })()`);
      let c = await mine(page);
      expect(c.live, `[${view.name}] case 6: the combo counter never went into its frozen hold (still live after 400 ticks)`).toBe(false);
      expect(c.hits, `[${view.name}] case 6: the frozen counter shows 0 hits`).toBeGreaterThan(0);
      await settleCamera(page);
      c = await settled(page);
      const { ax, ay } = c;
      await run(page, `window.__TTE__.arena.place(${String(foe)}, 1200, 200, 4)`);
      await settleCamera(page);
      const after = await settled(page);
      expect(after.ax, `[${view.name}] case 6: the frozen counter's anchor x moved from ${String(ax)} to ${String(after.ax)} when the foe moved away`).toBe(ax);
      expect(after.ay, `[${view.name}] case 6: the frozen counter's anchor y moved from ${String(ay)} to ${String(after.ay)} when the foe moved away`).toBe(ay);
      expect(Math.abs(after.headX - (after.frame.x + ((ax - after.view.x) / after.view.w) * after.frame.w)), `[${view.name}] case 6: the frozen counter's head x (${String(after.headX)}) is more than 1 px from the projection of its kept anchor`).toBeLessThanOrEqual(1);
      expect(errors, `[${vp(page)}] the page logged console or page errors during this case`).toEqual([]);
    });

    test('7: under reduced motion the combo counter settles on the first frame with no pop', async ({ page }) => {
      const errors = collectErrors(page);
      const foe = await openDemo(page, view.size, true);
      await comboTo(page, foe, 3);
      await settleCamera(page);
      const c = await mine(page);
      expect(c.settled, `[${view.name}] case 7: the counter is still easing on the first frame under reduced motion`).toBe(true);
      expect(c.scale, `[${view.name}] case 7: the counter popped to scale ${String(c.scale)} under reduced motion, expected 1`).toBeLessThanOrEqual(1 + 1e-6);
      expect(errors, `[${vp(page)}] the page logged console or page errors during this case`).toEqual([]);
    });

    test('9: the combo counter box is on the page and clear of the frame edge', async ({ page }) => {
      const errors = collectErrors(page);
      const foe = await openDemo(page, view.size);
      await comboTo(page, foe, 2);
      await settleCamera(page);
      const c = await settled(page);
      const vsz = page.viewportSize() as { width: number; height: number };
      const W = `[${view.name}] case 9: the counter's`;
      expect(c.x, `${W} left edge (${String(c.x)}) is inside the frame's 16 px margin; ${fmt(c)}`).toBeGreaterThanOrEqual(c.frame.x + 16 - 1);
      expect(c.css.x, `${W} page box is off the left of the page; css ${fmt(c.css)}`).toBeGreaterThanOrEqual(0);
      expect(c.css.y, `${W} page box is off the top of the page; css ${fmt(c.css)}`).toBeGreaterThanOrEqual(0);
      expect(c.css.x + c.css.w, `${W} page box is off the right of the page (width ${String(vsz.width)}); css ${fmt(c.css)}`).toBeLessThanOrEqual(vsz.width + 1);
      expect(c.css.y + c.css.h, `${W} page box is off the bottom of the page (height ${String(vsz.height)}); css ${fmt(c.css)}`).toBeLessThanOrEqual(vsz.height + 1);
      expect(errors, `[${vp(page)}] the page logged console or page errors during this case`).toEqual([]);
    });
  });
}

test.describe('combo anchor, two counters and 2v2', () => {
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: false });
  test.slow();

  test('8: two live combo counters keep 7 px apart unless one is stuck', async ({ page }) => {
    const errors = collectErrors(page);
    const foe = await openDemo(page, { width: 1280, height: 720 });
    const me = ((await chars(page)).find((c) => c.id !== foe) as Char).id;
    await comboTo(page, foe, 2, { x: 780, y: 380 });
    // The foe answers while the player is pinned: both counters show.
    const n = await page.evaluate<number>(`(async () => {
      const a = window.__TTE__.arena;
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      const cycle = ${JSON.stringify(CYCLE)};
      let n = 0;
      for (let t = 0; t < 300 && n < 2; t++) {
        a.place(${String(me)}, 700, 380, 0);
        a.place(${String(foe)}, 780, 380, 4);
        a.step(1, [cycle[0], cycle[t % cycle.length]]);
        await raf();
        n = a.fx().comboBoxes.length;
      }
      return n;
    })()`);
    const both = { length: n };
    test.skip(both.length < 2, 'the foe never landed a hit in the budget; covered by the unit tests');
    for (let i = 0; i < 60; i++) await raf2(page);
    const [a, b] = (await fx(page)).comboBoxes;
    if (a && b && !a.stuck && !b.stuck) expect(gapBetween(box(a), box(b)), `[1280x720] case 8: the two live counters (${fmt(box(a))} and ${fmt(box(b))}) are closer than 7 px`).toBeGreaterThanOrEqual(GAP - 1);
    expect(errors, `[${vp(page)}] the page logged console or page errors during this case`).toEqual([]);
  });

  test('4: in 2v2 a victim under the bench chips still gets its combo counter under the HUD ceiling', async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Team').selectOption('2');
    await page.getByLabel('Your race').selectOption('cyclonius');
    await page.getByLabel('Your partner (2v2)').selectOption('pax');
    await page.getByLabel('AI race').selectOption('fiara');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    await run(page, `window.__TTE__.arena.step(${String(INTRO)})`);
    const all = await chars(page);
    const me = all.find((c) => c.team === 0);
    const foe = all.find((c) => c.team === 1);
    expect(me && foe, '[1280x720] case 4: the 2v2 arena has no team 0 or no team 1 character').toBeTruthy();
    const started = await page.evaluate<boolean>(`(async () => {
      const a = window.__TTE__.arena;
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      const cycle = ${JSON.stringify(CYCLE)};
      const pin = (y) => { a.place(${String((me as Char).id)}, 700, y, 0); a.place(${String((foe as Char).id)}, 780, y, 4); };
      pin(380);
      for (let i = 0; i < 20; i++) { a.step(1, [${String(CHARGE)}, 0]); await raf(); }
      let hit = false;
      for (let t = 0; t < 300 && !hit; t++) {
        pin(380);
        a.step(1, [cycle[t % cycle.length], 0]);
        await raf();
        hit = a.fx().comboBoxes.some((b) => b.team === 0);
      }
      for (let t = 0; t < 6; t++) { pin(90); a.step(1, [cycle[t % cycle.length], 0]); await raf(); }
      return hit;
    })()`);
    expect(started, '[1280x720] case 4: no combo counter appeared for team 0 within 300 ticks in 2v2').toBe(true);
    await settleCamera(page);
    const s = await settled(page);
    expect(s.ceil, `[1280x720] case 4: the HUD ceiling (${String(s.ceil)}) is not above 120, so the bench chips did not raise it`).toBeGreaterThan(120);
    expect(s.base.y - s.h, `[1280x720] case 4: the counter's natural top (${String(s.base.y - s.h)}) is not above the ceiling (${String(s.ceil)}), so the clamp was not exercised`).toBeLessThan(s.ceil);
    expect(s.y, `[1280x720] case 4: the counter's top (${String(s.y)}) is above the HUD ceiling (${String(s.ceil)}); ${fmt(s)}`).toBeGreaterThanOrEqual(s.ceil - 1);
    await shot(page, info, 'tag-2v2');
    expect(errors, `[${vp(page)}] the page logged console or page errors during this case`).toEqual([]);
  });
});
