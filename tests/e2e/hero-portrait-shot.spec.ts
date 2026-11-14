import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors, tapTourSplash } from './parity/helpers';

// The portrait rigs (tools/assets/portrait-rig, ADR-0020: Pax, Sindarosa, Curomo) in real fights. Each is drawn from its own
// 240 px sheet, ungraded, with frame names the manifest knows, and the body (the frame's visual box) keeps one display height
// through every action the fight shows, so the hero never jumps in size between rows. SHOT_DIR=<dir> saves headless screenshots
// at 1280x720 and 1920x1080 (dpr 2) for eyeballing against the portraits (tools/assets/portrait-rig/compare-shots.py).
// Page-side code is passed as strings because tsconfig.node has no DOM lib.

const SHOT_DIR = process.env['SHOT_DIR'];
const PORTRAIT = new Set(['pax', 'sindarosa', 'curomo']);
const FRAME_NAME = /^(idle|walk|cast|hurt|guard|dash|ko|victory|tagIn)\/(E|SE|S|N|NE)#\d$/;

interface Drawn { id: number; texture: string; frame: string; flipX: boolean; graded: boolean; bodyHeight: number }
interface Sample { tick: number; drawn: Drawn[] }

/** Runs `ticks` sim ticks one per rendered frame, sampling the sheet probe every `every` ticks. */
async function fight(page: Page, ticks: number, every: number): Promise<Sample[]> {
  return page.evaluate<Sample[]>(`(async () => {
    const a = window.__TTE__.arena;
    const out = [];
    for (let k = 0; k < ${String(ticks)}; k++) {
      a.step(1);
      await new Promise((r) => requestAnimationFrame(r));
      if (k % ${String(every)} === 0) {
        const p = await a.sheets();
        out.push({ tick: k, drawn: (p ? p.characters : []).map((c) => ({ id: c.id, texture: c.texture, frame: c.frame, flipX: c.flipX, graded: c.graded, bodyHeight: c.bodyHeight })) });
      }
    }
    return out;
  })()`);
}

/** Every sampled portrait-rig character: its own sheet, ungraded, a known frame name, one body height (within 1 px). */
function checkSamples(samples: Sample[]): Set<string> {
  const actions = new Set<string>();
  const heights = new Map<string, number[]>();
  for (const s of samples) {
    for (const c of s.drawn) {
      const hero = c.texture.replace(/^(sheet|map):/, '');
      if (!PORTRAIT.has(hero)) continue;
      expect(c.texture, `tick ${String(s.tick)}`).toBe(`sheet:${hero}`);
      expect(c.graded).toBe(false);
      expect(c.frame).toMatch(FRAME_NAME);
      actions.add(`${hero}:${c.frame.split('/')[0] ?? ''}`);
      const key = `${hero}#${String(c.id)}`;
      heights.set(key, [...(heights.get(key) ?? []), c.bodyHeight]);
    }
  }
  for (const [key, hs] of heights) {
    expect(Math.max(...hs) - Math.min(...hs), `${key} body height ${JSON.stringify([...new Set(hs)])}`).toBeLessThanOrEqual(1);
  }
  return actions;
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

async function arcade(page: Page, race: string, foe: string): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption(race);
  await page.getByLabel('AI race').selectOption(foe);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  const card = page.getByRole('button', { name: 'Got it' });
  if (await card.isVisible()) await card.click();
  await page.evaluate(`window.__TTE__.arena.step(91)`);
}

const PAIRS = [
  { race: 'pax', foe: 'sindarosa' },
  { race: 'sindarosa', foe: 'curomo' },
  { race: 'curomo', foe: 'pax' },
] as const;

for (const size of [{ w: 1280, h: 720, dpr: 1 }, { w: 1920, h: 1080, dpr: 2 }]) {
  test.describe(`${String(size.w)}x${String(size.h)}@${String(size.dpr)}`, () => {
    test.use({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: size.dpr });
    const tag = `${String(size.w)}`;

    for (const p of PAIRS) {
      test(`${p.race} vs ${p.foe}: portrait sheets, steady body height, no missing frames`, async ({ page }) => {
        test.slow();
        const errors = collectErrors(page);
        await arcade(page, p.race, p.foe);
        await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 560, 380, 0); a.place(f.id, 760, 380, 4); })()`);
        const samples = await fight(page, 40, 4);
        await shot(page, `${tag}-${p.race}-vs-${p.foe}-idle`);
        // the AI closes in, casts and hits: walk, cast, hurt and guard rows as the fight shows them
        samples.push(...(await fight(page, 260, 3)));
        await shot(page, `${tag}-${p.race}-vs-${p.foe}-fight`);
        const actions = checkSamples(samples);
        expect([...actions].some((a) => a.startsWith(`${p.race}:`)), JSON.stringify([...actions])).toBe(true);
        expect([...actions].some((a) => a.startsWith(`${p.foe}:`)), JSON.stringify([...actions])).toBe(true);
        expect(errors).toEqual([]);
      });
    }

    test('World Tour: a portrait-rig team on the stage 1 fight', async ({ page }) => {
      test.slow();
      const errors = collectErrors(page);
      await page.goto(`${START}&ff=arcade#tour`);
      await page.getByLabel('Hero 1 (lead)').selectOption('sindarosa');
      await page.getByLabel('Hero 2').selectOption('pax');
      await page.getByLabel('Hero 3').selectOption('curomo');
      await page.getByRole('button', { name: 'Start tour' }).click();
      await page.getByRole('button', { name: 'Fight' }).click();
      await tapTourSplash(page);
      await page.waitForFunction(ARENA_READY);
      await page.evaluate(`window.__TTE__.arena.step(91)`);
      const samples = await fight(page, 200, 4);
      await shot(page, `${tag}-tour-stage1`);
      const actions = checkSamples(samples);
      expect([...actions].some((a) => a.startsWith('sindarosa:')), JSON.stringify([...actions])).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}
