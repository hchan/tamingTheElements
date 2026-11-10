import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors, fixture, seedViaGameMaster, startBattle } from './parity/helpers';

// Arcade audio layers (WP-arcade-audio-layers, FUN-DESIGN section 3): an Arcade Versus battle with sound unlocked plays
// its synthesised cues (round, fight, hits, the KO) with no page errors, and leaving disconnects every synth node and
// leaves no listener; a Classic battle never loads the chunk, so its cues stay the sound map's (pinned, with the KO
// music cut and the voice limit, by src/game/audio/arcade-audio.test.ts). No test can listen: a human has to. Page-side
// code is passed as strings because tsconfig.node has no DOM lib.

interface ArcadeAudio {
  mounted: boolean;
  played: number;
  voices: number;
  nodes: number;
  musicCut: boolean;
}

/** Round 1's intro (FUN-DESIGN 2.10): `fight` comes on tick 91. */
const INTRO = 91;

const state = (page: Page): Promise<ArcadeAudio> => page.evaluate<ArcadeAudio>(`window.__TTE__.arena.arcadeAudio()`);
const step = (page: Page, n: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.step(${String(n)}, [0, 0])`);

test('Arcade Versus: the synth cues play with sound on, through a KO, and leaving disconnects them', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('sindarosa');
  await page.getByLabel('AI race').selectOption('cyclonius');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  // The first key press in the battle unlocks audio (browsers start a context suspended).
  await page.keyboard.press('Shift');
  await page.waitForFunction(`window.__TTE__.arena.audio().unlocked === true`);
  await expect.poll(async () => (await state(page)).mounted).toBe(true);

  await step(page, INTRO);
  const intro = await state(page);
  // Round 1 and FIGHT!
  expect(intro.played).toBe(2);
  expect(intro.nodes).toBeGreaterThan(0);

  // Live ticks: the AI plays the enemy, so hits, dashes and the like follow.
  await page.evaluate(`window.__TTE__.arena.stepLive(600)`);
  expect((await state(page)).played).toBeGreaterThan(intro.played);

  // A KO (the enemy at 0 HP, as arcade-rounds.spec.ts does) plays its stinger, then the round end plays its own.
  const before = (await state(page)).played;
  const id = await page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.team === 1).id`);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(id)}, 0); a.step(1); })()`);
  expect(await page.evaluate<string>(`window.__TTE__.arena.rounds().then((r) => r.main)`)).toBe('K.O.');
  expect((await state(page)).played).toBe(before + 1);
  await step(page, 200);
  expect((await state(page)).played).toBeGreaterThan(before + 1);

  // Leave: every synth node disconnected and no listener left.
  await page.evaluate(`window.__probe = window.__TTE__.arena`);
  await page.evaluate(`window.location.hash = '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  expect(await page.evaluate<ArcadeAudio>(`window.__probe.arcadeAudio()`)).toMatchObject({ mounted: false, nodes: 0 });
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});

test('Classic battle: never loads the Arcade audio chunk, so the layers never mount on its sound', async ({ page }) => {
  const errors = collectErrors(page);
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto(START);
  await startBattle(page, 'enterPracticeContainer');
  await page.keyboard.press('Shift');
  await page.waitForFunction(`window.__TTE__.arena.audio().unlocked === true`);
  await page.evaluate(`window.__TTE__.arena.stepLive(300)`);
  expect(requested.filter((u) => u.includes('arcade-audio'))).toEqual([]);
  expect(await state(page)).toMatchObject({ mounted: false, played: 0 });
  expect(errors).toEqual([]);
});
