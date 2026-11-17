import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters } from './parity/helpers';

// The Versus match-end beat (QA r90 P2): winner portrait and name, the result word, the stat chip and the buttons, reachable at
// desktop and phone size. Reaches the results with two forced super KOs (as arcade.spec does); `manual=1` holds the arena.
const SUPER = 1 << 13;
const INTRO = 71;
const KO_TO_ROUND_END = 30 + 120 + 60;

async function koFoe(page: Page): Promise<void> {
  const [me] = await characters(page, 0);
  const [foe] = await characters(page, 1);
  if (!me || !foe) throw new Error('both fighters must be in the arena');
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.place(${String(me.id)}, 300, 360, 0); a.place(${String(foe.id)}, 900, 360, 4); a.setMeter(0, 1000); a.setHp(${String(foe.id)}, 1); a.step(1, [${String(SUPER)}, 0]); a.step(${String(90 + KO_TO_ROUND_END)}); })()`);
}

for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`match end at ${String(size.width)}x${String(size.height)}: winner, result word, reachable buttons`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Your race').selectOption('sindarosa');
    await page.getByLabel('AI race').selectOption('pax');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
    await koFoe(page);
    await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
    await koFoe(page);
    const results = page.locator('#arcadeResults');
    await expect(page.getByRole('heading', { level: 1, name: 'Victory!' })).toBeVisible();
    await expect(results.locator('.matchEndName')).toContainText('Sindarosa');
    await expect(results.locator('.matchEndStats')).toContainText('Rounds 2-0');
    const dir = process.env['SHOT_DIR'];
    if (dir) await page.screenshot({ path: `${dir}/match-end-${String(size.width)}.png` });
    for (const sel of ['#arcadeRematch', '#arcadeChange', 'a.menuButton']) {
      const box = await results.locator(sel).boundingBox();
      expect(box, sel).not.toBeNull();
      expect(box?.height ?? 0, sel).toBeGreaterThanOrEqual(44);
      expect((box?.y ?? 0) + (box?.height ?? 0), `${sel} is on screen`).toBeLessThanOrEqual(size.height);
    }
  });
}
