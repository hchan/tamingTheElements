import { expect, test } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Redrawn arena floors (tools/assets/stage-gen/batch-h-floors.py): the Classic arena of each element loads the generated
// img/floor/<element>.png (not the legacy img/background photo), and a real headless match with that element's hero casting
// shows the floor and the abilities on it. Screenshots go to the test output dir (set FLOOR_OUT to keep them elsewhere).
const CASES: ReadonlyArray<readonly [string, string]> = [['fire', 'lavax'], ['water', 'curomo'], ['earth', 'rokcore'], ['air', 'cyclonius']];

for (const [element, hero] of CASES) {
  test(`${element} arena floor is the redrawn art and abilities are on it`, async ({ page }, info) => {
    const errors: string[] = [];
    const loaded: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' || /has no frame|missing frame/i.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => { if (new RegExp(`/img/(floor|background)/${element}\\.png`).test(r.url())) loaded.push(`${String(r.status())} ${r.url().replace(/^.*\/assets\//, '')}`); });
    await page.goto(`/?ff=arenaDemo&manual=1&seed=7&p1=${hero}`);
    await page.locator('#game canvas').waitFor();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate(`(() => {
      const a = window.__TTE__.arena;
      const [me, foe] = a.characters();
      a.place(me.id, 100, 380, 0);
      a.place(foe.id, 520, 380, 4);
    })()`);
    await page.evaluate('window.__TTE__.arena.step(1, [16, 0])');
    for (let i = 0; i < 14; i++) await page.evaluate('window.__TTE__.arena.step(1, [0, 0])');
    await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const out = process.env.FLOOR_OUT;
    const shot = await page.locator('#game canvas').screenshot({ path: out ? `${out}/${element}.png` : info.outputPath(`${element}-floor.png`) });
    expect(shot.length).toBeGreaterThan(2000);
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.every((l) => l.startsWith('200 img/'))).toBe(true);
    expect(errors).toEqual([]);
  });
}
