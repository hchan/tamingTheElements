import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters, collectErrors } from './parity/helpers';

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
  await page.waitForFunction(ARENA_READY);
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
