import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, collectErrors } from './parity/helpers';

// Element hit marks (QA r47/r48/r49): the contact mark on a hit and the super burst are tinted and shaped per element.
// Screenshots go to HIT_SPARK_OUT when set (else the test output dir). Page-side code is passed as strings (no DOM lib).
const SUPER = 1 << 13;
const INTRO = 91;
const CASES: ReadonlyArray<readonly [string, string]> = [['fire', 'lavax'], ['water', 'curomo'], ['earth', 'rokcore'], ['air', 'cyclonius']];
const frames = (page: Page): Promise<unknown> => page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');

async function open(page: Page, hero: string): Promise<void> {
  await page.goto(`/?ff=arenaDemo,arcade&manual=1&seed=7&p1=${hero}`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(INTRO)});
    const [me, foe] = a.characters();
    a.place(me.id, 300, 360, 0);
    a.place(foe.id, 450, 360, 4);
  })()`);
}
/** Mean colour of the saturated pixels that differ between two same-frame screenshots (mark hidden, mark shown) inside the foe's box: the hit mark alone. */
async function markColour(page: Page, before: Buffer, after: Buffer): Promise<{ r: number; g: number; b: number; n: number }> {
  return page.evaluate<{ r: number; g: number; b: number; n: number }>(
    `(async () => {
      const load = (b64) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + b64; });
      const px = async (b64) => { const i = await load(b64); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return { w: i.width, h: i.height, d: x.getImageData(0, 0, i.width, i.height).data }; };
      const a = await px(${JSON.stringify(before.toString('base64'))});
      const b = await px(${JSON.stringify(after.toString('base64'))});
      const x0 = Math.floor(a.w * 0.33), x1 = Math.floor(a.w * 0.52), y0 = Math.floor(a.h * 0.44), y1 = Math.floor(a.h * 0.66);
      let r = 0, g = 0, bl = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * a.w + x) * 4;
        const dr = b.d[i] - a.d[i], dg = b.d[i + 1] - a.d[i + 1], db = b.d[i + 2] - a.d[i + 2];
        if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 90) continue;
        const mx = Math.max(b.d[i], b.d[i + 1], b.d[i + 2]), mn = Math.min(b.d[i], b.d[i + 1], b.d[i + 2]);
        if (mx < 90 || (mx - mn) / mx < 0.3) continue;
        r += b.d[i]; g += b.d[i + 1]; bl += b.d[i + 2]; n++;
      }
      return { r: n ? r / n : 0, g: n ? g / n : 0, b: n ? bl / n : 0, n };
    })()`,
  );
}
const measured = new Map<string, { r: number; g: number; b: number; n: number }>();
const shotPath = (name: string, fallback: string): string => {
  const out = process.env['HIT_SPARK_OUT'];
  return out ? `${out}/${name}.png` : fallback;
};

for (const reduced of [false, true]) {
  test.describe(reduced ? 'reduced motion' : 'full motion', () => {
    test.use({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    for (const [element, hero] of CASES) {
      test(`${element}: plain hit and super burst render per element`, async ({ page }, info) => {
        const errors = collectErrors(page);
        await open(page, hero);
        const foeHp = (): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.characters()[1].hp`);
        const start = await foeHp();
        // Primary and secondary alternate in bursts: heroes differ in which one connects at this range.
        for (let i = 0; i < 80 && (await foeHp()) === start; i++) await page.evaluate(`window.__TTE__.arena.step(1, [${i % 8 < 4 ? '16' : '32'}, 0])`);
        expect(await foeHp()).toBeLessThan(start);
        await frames(page);
        const tag = reduced ? 'reduced' : 'full';
        const plain = await page.locator('#game canvas').screenshot({ path: shotPath(`hit-${element}-${tag}`, info.outputPath('hit.png')) });
        expect(plain.length).toBeGreaterThan(2000);
        if (!reduced) {
          // Same frame with the mark layers hidden: the diff is the mark alone (not the swing, the hit flash or the ambient floor).
          await page.evaluate('window.__TTE__.arena.hitMarkHide(true)');
          await frames(page);
          const settled = await page.locator('#game canvas').screenshot();
          await page.evaluate('window.__TTE__.arena.hitMarkHide(false)');
          const m = await markColour(page, settled, plain);
          expect(m.n, `${element} mark has saturated pixels`).toBeGreaterThan(40);
          measured.set(element, m);
        }
        await page.evaluate(`(() => {
          const a = window.__TTE__.arena;
          a.step(60);
          a.setMeter(0, 1000);
          a.step(1, [${String(SUPER)}, 0]);
          a.step(10);
        })()`);
        await frames(page);
        // The super view is a lazy chunk, so the burst appears a few frames after the cut-in starts.
        const burstOf = (): Promise<{ element: string } | undefined> => page.evaluate('window.__TTE__.arena.superBurst()');
                await expect
          .poll(async () => (await burstOf())?.element, { timeout: 20_000 })
          .toBe(element);
        const sup = await page.locator('#game canvas').screenshot({ path: shotPath(`super-${element}-${tag}`, info.outputPath('super.png')) });
        expect(sup.length).toBeGreaterThan(2000);
        expect(errors).toEqual([]);
      });
    }
  });
}

// Fails if the per-element marks converge on one colour (QA r51: fire, water and earth all read as the same pale cyan burst).
test('hit mark colours stay apart per attacker element', () => {
  const hit = (e: string): { r: number; g: number; b: number } => {
    const m = measured.get(e);
    if (!m) throw new Error(`no measurement for ${e} (run the whole file)`);
    return m;
  };
  const fire = hit('fire');
  const water = hit('water');
  const earth = hit('earth');
  const air = hit('air');
  expect(fire.r).toBeGreaterThan(fire.b + 50);
  expect(water.b).toBeGreaterThan(water.r + 30);
  expect(earth.r).toBeGreaterThan(earth.b + 30);
  expect(air.g).toBeGreaterThanOrEqual(air.b - 6);
  const names = ['fire', 'water', 'earth', 'air'];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = hit(names[i] as string);
      const b = hit(names[j] as string);
      const d = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
      expect(d, `${String(names[i])} vs ${String(names[j])} mean mark colour`).toBeGreaterThan(30);
    }
  }
});
