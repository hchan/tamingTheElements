import { expect, test, type Page } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';
import { waitForArena } from './support/wait';

// How-to-play practice (#tutorial, opened from Help): the lesson card, the ring over the slot to use and Skip.
// The sim is manually stepped (?manual=1); lessons are advanced with the same `tte:sim-event` the real fight emits.
const PAST_BANNER = 'window.__TTE__.arena.step(160)';
const BANNED = /classic|arcade|ruleset|capture/i;

async function open(page: Page): Promise<void> {
  await page.goto(`${START}#tutorial`);
  await waitForArena(page);
  await page.evaluate(PAST_BANNER);
}

const sim = (page: Page, detail: object): Promise<unknown> =>
  page.evaluate(`window.dispatchEvent(new CustomEvent('tte:sim-event', { detail: ${JSON.stringify(detail)} }))`);

test('practice shows lesson 1 with a ring, walks the lessons and finishes', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  const title = page.locator('#tutorialTitle');
  await expect(title).toContainText('Lesson 1');
  await expect(page.locator('#tutorialRing')).toBeVisible();
  expect(await page.locator('#tutorialCard').innerText()).not.toMatch(BANNED);

  await sim(page, { kind: 'hit', ability: 3 });
  await expect(title).toContainText('Lesson 2');
  await sim(page, { kind: 'hit', ability: 4 });
  await expect(title).toContainText('Lesson 3');
  await sim(page, { kind: 'super', caster: 0 });
  await expect(title).toContainText('Lesson 4');
  await expect(page.locator('#tutorialRing')).toBeHidden();
  await sim(page, { kind: 'hit', ability: 3 });
  await sim(page, { kind: 'hit', ability: 3 });
  await expect(title).toContainText('Lesson 5');
  await expect(page.locator('#tutorialRing')).toBeVisible();
  await sim(page, { kind: 'weather', stage: 0 });
  await expect(title).toContainText('Lesson 6');
  await expect(page.locator('#tutorialRing')).toBeVisible();
  await sim(page, { kind: 'cleanse', stage: 0 });
  await expect(title).toContainText('Lesson 7');
  await expect(page.locator('#tutorialRing')).toBeVisible();
  // Guard: the lesson watches the real Guard slot light up (held key), so hold the guard key in the live sim.
  await page.keyboard.down('KeyQ');
  await page.evaluate('window.__TTE__.arena.step(30)');
  await expect.poll(async () => (await title.innerText()).includes('Lesson 8'), { timeout: 5000, message: 'holding Guard moves the lesson on' }).toBe(true);
  await page.keyboard.up('KeyQ');
  const card = page.locator('#tutorialCard');
  expect(await card.innerText()).toMatch(/double damage/);
  await sim(page, { kind: 'hit', ability: 3 });
  await expect(title).toContainText('Lesson 8');
  await sim(page, { kind: 'patch', stage: 1 });
  await sim(page, { kind: 'hit', ability: 3 });
  // Each new patch lesson restarts the fight on its own stage.
  await expect(title).toContainText('Lesson 9');
  await expect(card).toContainText('heals');
  await waitForArena(page);
  await page.evaluate(PAST_BANNER);
  await sim(page, { kind: 'patch', stage: 2 });
  await expect(title).toContainText('Lesson 10');
  await expect(card).toContainText('faster');
  await waitForArena(page);
  await page.evaluate(PAST_BANNER);
  await sim(page, { kind: 'patch', stage: 4 });
  await expect(title).toContainText('Lesson 11');
  await expect(card).toContainText('rocks block');
  await waitForArena(page);
  await page.evaluate(PAST_BANNER);
  await sim(page, { kind: 'blocked', stage: 3 });
  await expect(page.locator('#tutorialSkip')).toHaveText('Back to Help');
  expect(await page.locator('#tutorialCard').innerText()).not.toMatch(BANNED);

  await page.locator('#tutorialSkip').click();
  await expect(page).toHaveURL(/#help$/);
  await page.evaluate('window.__TTE__.settled()');
  expect(errors).toEqual([]);
});

test('Skip leaves practice for Help', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await page.locator('#tutorialSkip').click();
  await expect(page).toHaveURL(/#help$/);
  await page.evaluate('window.__TTE__.settled()');
  expect(errors).toEqual([]);
});

test('Skip works from the keyboard (focus, Enter)', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await page.locator('#tutorialSkip').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#help$/);
  await page.evaluate('window.__TTE__.settled()');
  expect(errors).toEqual([]);
});
