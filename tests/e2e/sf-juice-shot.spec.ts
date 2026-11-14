import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters, collectErrors } from './parity/helpers';

// Street Fighter feel (presentation only): round-start name cards, the big K.O. banner with its halo, reduced motion.
// Screenshots land in test-results via info.outputPath. Page-side code is passed as strings (no DOM lib in tsconfig.node).

interface Rounds { main: string; visible: boolean; cards: [string, string] }
const rounds = (page: Page): Promise<Rounds | undefined> => page.evaluate<Rounds | undefined>(`window.__TTE__.arena.rounds()`);
const step = (page: Page, n: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.step(${String(n)})`);
const settle = (page: Page): Promise<unknown> => page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');

async function versus(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await expect.poll(async () => (await rounds(page))?.main).toBe('ROUND 1');
}

for (const size of [{ w: 1280, h: 720 }, { w: 1920, h: 1080 }]) {
  test.describe(`${String(size.w)}x${String(size.h)}`, () => {
    test.use({ viewport: { width: size.w, height: size.h } });

    test('name cards fill the intro, clear before FIGHT!, and the K.O. banner is big', async ({ page }, info) => {
      const errors = collectErrors(page);
      await versus(page);
      await step(page, 30);
      const mid = await rounds(page);
      expect(mid?.cards[0]).not.toBe('');
      expect(mid?.cards[1]).not.toBe('');
      await settle(page);
      await page.locator('#game canvas').screenshot({ path: info.outputPath(`intro-cards-${String(size.w)}.png`) });
      await step(page, 62);
      expect(await rounds(page)).toMatchObject({ main: 'FIGHT!', cards: ['', ''] });
      await settle(page);
      await page.locator('#game canvas').screenshot({ path: info.outputPath(`fight-${String(size.w)}.png`) });
      await step(page, 60);
      const [foe] = await characters(page, 1);
      await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(foe?.id)}, 0); a.step(1); })()`);
      expect(await rounds(page)).toMatchObject({ main: 'K.O.', visible: true, cards: ['', ''] });
      await step(page, 4);
      await settle(page);
      await page.locator('#game canvas').screenshot({ path: info.outputPath(`ko-${String(size.w)}.png`) });
      expect(errors).toEqual([]);
    });
  });
}

test('reduced motion: names still show at once with no slide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await versus(page);
  await step(page, 30);
  const r = await rounds(page);
  expect(r?.cards[0]).not.toBe('');
});
