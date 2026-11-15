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
