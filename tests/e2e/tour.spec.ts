import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters, collectErrors, tapTourSplash } from './parity/helpers';

// World Tour shell (WP-tour-shell, FUN-DESIGN 2.18): pick three heroes, the "Stage 1 of 9" card, a best-of-3 Arcade fight won by
// knocking out the foes twice (manual stepping, no waiting), then the Stage 2 card; the run is saved in its own key and offered
// again on reload. Page-side code is passed as strings because tsconfig.node has no DOM lib.
const INTRO = 91;
const KO_TO_RESULT = 30 + 120 + 60;
const KEY = 'tte.tour.v1';
const step = (page: Page, n: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.step(${String(n)})`);

/** Knocks out the three foes one after another (each KO brings the next in), then runs the KO and round-end phases. */
async function winRound(page: Page): Promise<void> {
  for (let k = 0; k < 3; k++) {
    const [foe] = await characters(page, 1);
    await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(foe?.id)}, 0); a.step(1); })()`);
  }
  await step(page, KO_TO_RESULT);
}

test('World Tour: pick a team, fight stage 1 to a win, land on the stage 2 card, then resume after a reload', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#tour`);
  await page.getByLabel('Hero 1 (lead)').selectOption('fiara');
  await page.getByLabel('Hero 2').selectOption('rokcore');
  await page.getByLabel('Hero 3').selectOption('curomo');
  await page.getByRole('button', { name: 'Start tour' }).click();

  await expect(page.getByRole('heading', { name: 'Stage 1 of 9' })).toBeVisible();
  const card = page.locator('#tourStage');
  await expect(card).toContainText('Location:');
  await expect(card).toContainText('Opponent:');
  await expect(card).toContainText('Difficulty: Easy');
  await expect(card).toContainText('3 of 3 continues left');
  await expect(page.locator('#tourMap svg[role="img"]')).toHaveAttribute('aria-label', /0 of 9 stages cleared/);
  await expect(page.locator('#tourMap svg [data-pin]')).toHaveCount(9);
  await expect(page.locator('#tourPins li[data-state="current"]')).toContainText('Stage 1:');
  await expect(page.locator('#tourPins li[data-state="locked"]')).toHaveCount(8);
  await expect(page.locator('#tourPins li[data-state="locked"]').first()).toContainText('Locked');
  expect(await page.evaluate<string | null>(`localStorage.getItem('${KEY}')`)).toContain('"stage":0');

  await page.getByRole('button', { name: 'Fight' }).click();
  // The versus splash shows first; this run lets it auto-advance (1.2 s) into the match.
  // One atomic read: the splash is gone after 1.2 s, so separate polling assertions could straddle its removal under load.
  await page.waitForFunction(`(() => { const t = document.querySelector('#tourSplash')?.textContent ?? ''; return t.includes('Stage 1 of 9') && t.includes('You: Fiara (fire)') && t.includes('Opponent:'); })()`, undefined, { timeout: 1_000 });
  await page.waitForFunction(ARENA_READY);
  await expect(page.locator('#tourSplash')).toHaveCount(0);
  await step(page, INTRO);
  await winRound(page);
  await step(page, INTRO);
  await winRound(page);

  // The match is over: the arena is torn down and the next card is the stage 2 map card.
  await expect(page.getByRole('heading', { name: 'Stage 2 of 9' })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  await expect(page.locator('#tourPins li[data-state="cleared"]')).toHaveCount(1);
  await expect(page.locator('#tourPins li[data-state="cleared"]')).toContainText('Cleared');
  expect(await page.evaluate<string | null>(`localStorage.getItem('${KEY}')`)).toContain('"stage":1');

  // Reload: the run is offered, and Resume lands on the same card.
  await page.goto(`${START}&ff=arcade#main`);
  await page.goto(`${START}&ff=arcade#tour`);
  await expect(page.locator('#tourResume')).toContainText('stage 2 of 9');
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('heading', { name: 'Stage 2 of 9' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('World Tour: the versus splash is skipped by Enter and by a click', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade,holdSplash#tour`);
  await page.getByRole('button', { name: 'Start tour' }).click();
  await page.getByRole('button', { name: 'Fight' }).click();
  await expect(page.locator('#tourSplash svg')).toHaveCount(2);
  await page.keyboard.press('Enter');
  await page.waitForFunction(ARENA_READY);
  await expect(page.locator('#tourSplash')).toHaveCount(0);

  // Leaving mid-splash never starts a battle; a click skips it.
  await page.goto(`${START}&ff=arcade,holdSplash#main`);
  await page.goto(`${START}&ff=arcade,holdSplash#tour`);
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Fight' }).click();
  await page.locator('#tourSplash').click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.settled()`);
  expect(errors).toEqual([]);
});

test('World Tour: reduced motion skips the splash', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${START}&ff=arcade#tour`);
  await page.getByRole('button', { name: 'Start tour' }).click();
  await page.getByRole('button', { name: 'Fight' }).click();
  // The splash never shows under reduced motion; arena load time under SwiftShader varies, so the wait is generous.
  await expect(page.locator('#tourSplash')).toHaveCount(0);
  await page.waitForFunction(ARENA_READY, undefined, { timeout: 10_000 });
  await expect(page.locator('#tourSplash')).toHaveCount(0);
});

test('World Tour: no continues left shows the Game Over card with the summary, and Play again starts a new pick', async ({ page }) => {
  const errors = collectErrors(page);
  const run = { v: 1, seed: 5, hero: ['fiara', 'rokcore', 'curomo'], stage: 2, continues: 0, status: 'lost' };
  await page.goto(`${START}&ff=arcade#main`);
  await page.evaluate(`localStorage.setItem('${KEY}', ${JSON.stringify(JSON.stringify(run))})`);
  await page.goto(`${START}&ff=arcade#tour`);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#tourContinue')).toBeDisabled();
  await page.getByRole('button', { name: 'Give up' }).click();
  const over = page.locator('#tourOver');
  await expect(over.getByRole('heading', { name: 'Game over' })).toBeVisible();
  await expect(over).toContainText('Stages cleared: 2 of 9.');
  await expect(over).toContainText('Continues used: 3 of 3');
  await expect(over).toContainText('Hero team: Fiara (fire), Rokcore (earth), Curomo (water).');
  await expect(over.getByRole('link', { name: 'Main Menu' })).toBeVisible();
  await over.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByRole('button', { name: 'Start tour' })).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('World Tour on a touch device', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

  test('the fight shows the 9 Arcade touch buttons in at most three right-edge columns, 48 px tall at least', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#tour`);
    await page.getByRole('button', { name: 'Start tour' }).tap();
    await page.getByRole('button', { name: 'Fight' }).tap();
    await tapTourSplash(page);
    await page.waitForFunction(ARENA_READY);
    const buttons = page.locator('#game button.menuButton');
    await expect(buttons).toHaveCount(9);
    const boxes = await page.evaluate<{ right: number; height: number }[]>(
      `Array.from(document.querySelectorAll('#game button.menuButton'), (b) => { const r = b.getBoundingClientRect(); return { right: r.right, height: r.height }; })`,
    );
    for (const b of boxes) expect(b.height).toBeGreaterThanOrEqual(48);
    // 9 buttons no longer fit one column on a short screen (WP 39b): columns of four, Element alone in a third.
    expect(new Set(boxes.map((b) => Math.round(b.right))).size).toBeLessThanOrEqual(3);
    await expect(page.locator('#arcadeTag2')).toBeVisible();
    // A tap on Super reaches the arena as the bound key; the match goes on without errors.
    await page.locator('#arcadeSuper').tap();
    await page.evaluate(`window.__TTE__.arena.step(5)`);
    await page.goto(`${START}&ff=arcade#main`);
    await page.evaluate(`window.__TTE__.settled()`);
    expect(errors).toEqual([]);
  });
});
