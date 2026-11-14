import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Arcade tile floors, in game, on every stage (no stage-forcing hook needed): each element's hero calls its own weather
// (setWeatherCharge + the weather command), which swaps the stage to that element after the telegraph. Shots go to the
// test output dir (FLOOR_OUT keeps them elsewhere) for the grim-look review; the assertion is the stage and backdrop.
const WEATHER = 1 << 14;
const TRAP = 1 << 6;
const INTRO = 91;
const CASES: ReadonlyArray<readonly [string, string, number]> = [['fire', 'sindarosa', 1], ['water', 'curomo', 2], ['earth', 'rokcore', 3], ['air', 'echo', 4]];

for (const [element, hero, stage] of CASES) {
  test(`Arcade ${element} stage draws its tile floor, patches and trap pads`, async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Your race').selectOption(hero);
    await page.getByLabel('AI race').selectOption('pax');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)}, [0, 0])`);
    const out = process.env.FLOOR_OUT;
    const snap = async (name: string): Promise<void> => {
      await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const shot = await page.locator('#game canvas').screenshot({ path: out ? `${out}/arcade-${element}${name}.png` : info.outputPath(`arcade-${element}${name}.png`) });
      expect(shot.length).toBeGreaterThan(2000);
    };
    if (stage === 1) await snap('-fight'); // the FIGHT! banner (the first ticks after the intro)
    await page.evaluate(`window.__TTE__.arena.setWeatherCharge(0, 1000)`);
    await page.evaluate(`window.__TTE__.arena.step(1, [${String(WEATHER)}, 0])`);
    await page.evaluate(`window.__TTE__.arena.step(60, [0, 0])`);
    await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const t = await page.evaluate<{ stage: number; backdrop: string } | undefined>('window.__TTE__.arena.terrain()');
    expect(t).toMatchObject({ stage, backdrop: element });
    await snap('');
    // Lay a trap (Z) beside the hero so the pad is seen on this floor.
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 500, 360, 0); a.place(foe.id, 1500, 360, 4); })()`);
    // Forced commands, not the live keyboard (the foe stays idle, so nothing can stun the hero or hit the pad). The sim finds the
    // press edge itself, so settle idle, then tap up to 5 times (one live trap at a time, so a retry cannot plant two).
    await page.evaluate('window.__TTE__.arena.step(150, [0, 0])');
    let traps = 0;
    for (let i = 0; i < 5 && traps === 0; i++) {
      await page.evaluate(`window.__TTE__.arena.step(2, [${String(TRAP)}, 0])`);
      await page.evaluate('window.__TTE__.arena.step(40, [0, 0])');
      // traps() reads the markers the view drew on its last frame, so let two frames render the stepped ticks before sampling.
      await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
      traps = (await page.evaluate<readonly unknown[] | undefined>('window.__TTE__.arena.traps()'))?.length ?? 0;
    }
    expect(traps).toBe(1);
    await snap('-trap');
    expect(errors).toEqual([]);
  });
}
