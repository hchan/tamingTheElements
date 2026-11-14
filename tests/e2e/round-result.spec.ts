import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters, collectErrors } from './parity/helpers';

// Round result card (round-result-banner): after a round ends the YOU WIN / YOU LOSE card shows under the banner with the
// score and what happened, for about 2 s; the live region carries the same summary. Drives the round by forcing a KO
// through the test probe, as arcade-rounds.spec.ts does. Page-side code is passed as strings (no DOM lib in tsconfig.node).

interface Result {
  visible: boolean;
  tone: string;
  kicker: string;
  title: string;
  headline: string;
  lines: string[];
}
interface Rounds {
  main: string;
  sub: string;
  won: [number, number];
  result: Result;
}

const INTRO = 91;
const KO_TO_RESULT = 30 + 120;
/** The card stays 100 view ticks from `roundEnded`. */
const CARD_TICKS = 100;

const rounds = (page: Page): Promise<Rounds | undefined> => page.evaluate<Rounds | undefined>(`window.__TTE__.arena.rounds()`);
const step = (page: Page, n: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.step(${String(n)})`);
const live = (page: Page): Promise<string> =>
  page.evaluate<string>(`[document.getElementById('liveRegion'), document.getElementById('liveRegionAssertive')].map((n) => n ? n.textContent : '').join(' | ')`);

async function versus(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await expect.poll(async () => (await rounds(page))?.main).toBe('ROUND 1');
  await step(page, INTRO + 10);
}

async function knockOut(page: Page, team: number): Promise<void> {
  const [who] = await characters(page, team);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(who?.id)}, 0); a.step(1); })()`);
  await step(page, KO_TO_RESULT);
}

/** With SHOTS_DIR set, saves a screenshot of the game (the real canvas) for a human look. */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env['SHOTS_DIR'];
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
}

test('winning a round shows YOU WIN with the score and what happened, then goes after about 2 s', async ({ page }) => {
  const errors = collectErrors(page);
  await versus(page);
  expect((await rounds(page))?.result.visible).toBe(false);
  await knockOut(page, 1);
  const r = await rounds(page);
  expect(r?.won).toEqual([1, 0]);
  expect(r?.result).toMatchObject({
    visible: true, tone: 'win', kicker: 'ROUNDS 1 - 0', title: 'ROUND 1 WON', headline: 'PERFECT K.O.',
  });
  expect(r?.result.lines[0]).toBe('HEALTH LEFT 100%');
  await expect.poll(() => live(page), { timeout: 10_000 }).toContain('You win round 1. Rounds 1 to 0. Perfect knockout. Health left 100 percent.');
  await step(page, 20);
  await shot(page, 'round-win');
  await step(page, CARD_TICKS - 20);
  const later = await rounds(page);
  expect(later?.result.visible).toBe(false);
  expect(later?.main).toBe('ROUND 2');
  expect(errors).toEqual([]);
});

test('losing a round shows YOU LOSE; reduced motion still shows the card', async ({ page }) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await versus(page);
  await knockOut(page, 0);
  const r = await rounds(page);
  expect(r?.won).toEqual([0, 1]);
  expect(r?.result).toMatchObject({ visible: true, tone: 'lose', kicker: 'ROUNDS 0 - 1', title: 'ROUND 1 LOST', headline: 'K.O.' });
  expect(r?.result.lines[0]).toMatch(/^HEALTH LEFT \d+%$/);
  await expect.poll(() => live(page), { timeout: 10_000 }).toContain('You lose round 1. Rounds 0 to 1.');
  await shot(page, 'round-lose');
  expect(errors).toEqual([]);
});
