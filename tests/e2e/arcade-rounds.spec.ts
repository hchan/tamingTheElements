import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters, collectErrors } from './parity/helpers';

// Arcade round announcer and timer HUD (WP-arcade-announcer-view, FUN-DESIGN 2.10): "ROUND 1", "FIGHT!", the timer, "K.O."
// with "PERFECT", the round result and pips, live-region lines, reduced motion (text stays, no scale-in), Classic
// untouched and no listener left behind. Page-side code is passed as strings because tsconfig.node has no DOM lib.
// Manual stepping: banners run on the view tick, so they hold between steps.

interface Rounds {
  main: string;
  sub: string;
  visible: boolean;
  scale: number;
  timer: string;
  timerColor: string;
  won: [number, number];
}

/** Round 1's intro: nobody acts until tick 91. */
const INTRO = 91;
/** From the KO tick to `roundEnded`: the 30-tick KO stop, then the 120-tick KO phase. */
const KO_TO_RESULT = 30 + 120;

const rounds = (page: Page): Promise<Rounds | undefined> => page.evaluate<Rounds | undefined>(`window.__TTE__.arena.rounds()`);
const step = (page: Page, n: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.step(${String(n)})`);
const played = (page: Page): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.arcadeAudio().then((a) => a.played)`);
const live = (page: Page): Promise<string> =>
  page.evaluate<string>(`[document.getElementById('liveRegion'), document.getElementById('liveRegionAssertive')].map((n) => n ? n.textContent : '').join(' | ')`);

async function demo(page: Page, ff: string): Promise<void> {
  await page.goto(`/?ff=${ff}&manual=1&seed=7`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
}

async function versus(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
}

test('Arcade Versus: ROUND 1, FIGHT!, the timer, K.O. PERFECT, the result with a pip, then ROUND 2', async ({ page }) => {
  const errors = collectErrors(page);
  await versus(page);
  // The round HUD is a lazy chunk; once loaded it catches up with the intro already running.
  await expect.poll(async () => (await rounds(page))?.main).toBe('ROUND 1');
  expect(await rounds(page)).toMatchObject({ visible: true, timer: '90', won: [0, 0] });
  await step(page, INTRO);
  expect(await rounds(page)).toMatchObject({ main: 'FIGHT!', visible: true, timer: '90' });
  // FIGHT! goes after 1 s; the timer counts the fight (no input: no hits, so no freeze holds it).
  await step(page, 550);
  const fighting = await rounds(page);
  expect(fighting?.visible).toBe(false);
  expect(Number(fighting?.timer)).toBeGreaterThanOrEqual(78);
  expect(Number(fighting?.timer)).toBeLessThanOrEqual(80);
  // The foe (1v1) drops with the player untouched: a perfect KO.
  const [foe] = await characters(page, 1);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(foe?.id)}, 0); a.step(1); })()`);
  expect(await rounds(page)).toMatchObject({ main: 'K.O.', sub: 'PERFECT', visible: true });
  await step(page, KO_TO_RESULT);
  expect(await rounds(page)).toMatchObject({ main: 'PERFECT', sub: 'YOU WIN ROUND 1', visible: true, won: [1, 0] });
  await step(page, 60);
  expect(await rounds(page)).toMatchObject({ main: 'ROUND 2', visible: true, timer: '90', won: [1, 0] });
  expect(errors).toEqual([]);
});

test('reduced motion: the banner text stays but does not scale in; Classic has no round HUD', async ({ page }) => {
  await demo(page, 'arenaDemo,arcade');
  await expect.poll(async () => (await rounds(page))?.main).toBe('ROUND 1');
  // Tick 0: the banner has just appeared, so it is still scaling in.
  expect((await rounds(page))?.scale).toBeGreaterThan(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await demo(page, 'arenaDemo,arcade');
  await expect.poll(async () => (await rounds(page))?.main).toBe('ROUND 1');
  expect(await rounds(page)).toMatchObject({ visible: true, scale: 1 });
  await demo(page, 'arenaDemo');
  expect(await rounds(page)).toBeUndefined();
});

test('Arcade Versus: live-region lines for the round, the fight and the KO; leaving keeps 0 listeners', async ({ page }) => {
  const errors = collectErrors(page);
  await versus(page);
  await expect.poll(async () => (await rounds(page))?.main).toBe('ROUND 1');
  await step(page, INTRO);
  // FIGHT! is assertive, so it goes out at once (with "Round 1." if that line is still waiting).
  await expect.poll(() => live(page)).toContain('Fight!');
  const [foe] = await characters(page, 1);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(foe?.id)}, 0); a.step(1); })()`);
  await expect.poll(() => live(page)).toContain('K.O. You knocked out the enemy. Perfect.');
  await step(page, KO_TO_RESULT);
  await expect.poll(() => live(page), { timeout: 10_000 }).toContain('You win round 1. Rounds 1 to 0.');
  await page.evaluate(`window.location.hash = '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(await page.locator('#liveRegion').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('Arcade Versus: a 2-2 draw starts sudden death, with its banner, live line and a screenshot', async ({ page }, info) => {
  const errors = collectErrors(page);
  await versus(page);
  await expect.poll(async () => (await rounds(page))?.main).toBe('ROUND 1');
  // The first key press unlocks audio (browsers start a context suspended), so the sudden-death sting can be counted.
  await page.keyboard.press('Shift');
  await page.waitForFunction(`window.__TTE__.arena.audio().unlocked === true`);
  await step(page, INTRO);
  // Rounds are 1-1; a double KO is a draw that makes it 2-2, which needs one more round.
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setRoundsWon(1, 1); for (const c of a.characters()) a.setHp(c.id, 0); a.step(1); })()`);
  expect(await rounds(page)).toMatchObject({ main: 'DOUBLE K.O.' });
  await step(page, KO_TO_RESULT);
  expect(await rounds(page)).toMatchObject({ sub: 'ROUND 1 DRAW', won: [2, 2] });
  const before = await played(page);
  await step(page, 60);
  expect(await rounds(page)).toMatchObject({ main: 'SUDDEN DEATH', visible: true, won: [2, 2] });
  // The sting (one cue) played at the round start, and the timer says it in words and its own colour, not only red.
  expect(await played(page)).toBe(before + 1);
  expect(await rounds(page)).toMatchObject({ timer: expect.stringMatching(/^SUDDEN \d\d$/), timerColor: '#c07ab0' });
  await expect.poll(() => page.evaluate<string>(`document.getElementById('liveRegionAssertive')?.textContent ?? ''`))
    .toContain('Sudden death. One hit may decide the match.');
  const hp = await characters(page, 0);
  expect(hp[0]?.hp).toBeLessThan((hp[0]?.maxHp ?? 0) / 5);
  // The banner scales in over 30 view ticks; the picture is taken once it is at rest (it must fit the 1280 px width).
  await step(page, 30);
  expect(await rounds(page)).toMatchObject({ main: 'SUDDEN DEATH', visible: true, scale: 1 });
  await page.screenshot({ path: info.outputPath('sudden-death.png') });
  await step(page, 60);
  expect(await rounds(page)).toMatchObject({ main: 'FIGHT!' });
  expect(errors).toEqual([]);
});
