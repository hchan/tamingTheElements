import { expect, test } from '@playwright/test';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { createMatch } from '../../src/core/sim/match';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Rokcore life readout: the HUD names absolute life ("Life 358/358") beside each bar, so a giant's smaller pool is readable, not guessed.
const INTRO = 91;

/** The Arcade 1v1 life of each race, read from the sim's own data (a balance retune moves it) instead of a hard-coded number. */
function arcadeLife(p1: string, p2: string): readonly [number, number] {
  const { state } = createMatch({
    simVersion: 0, seed: 3, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 0 }], p2: [{ character: characterId(p2), xp: 0 }],
  });
  return [state.maxHp[0] ?? 0, state.maxHp[1] ?? 0];
}

test('Rokcore and Pax life is written as words and numbers beside the bars', async ({ page }, info) => {
  const errors = collectErrors(page);
  const [rok, pax] = arcadeLife('rokcore', 'pax');
  expect(rok).toBeGreaterThan(0);
  expect(pax).toBeGreaterThan(rok);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('rokcore');
  await page.getByLabel('AI race').selectOption('pax');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const labels = await page.evaluate<string[]>(`window.__TTE__.arena.heroLabels()`);
  expect(labels[0]).toContain(`Life ${String(rok)}/${String(rok)}`);
  expect(labels[1]).toContain(`Life ${String(pax)}/${String(pax)}`);
  expect((await page.locator('#game canvas').screenshot({ path: info.outputPath('life-readout.png') })).length).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});
