import { expect, test } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Element identity is never colour alone (ideas/done/a11y-colour-blind-element-cues): the HUD draws a white silhouette on a
// dark chip at each portrait. The shapes themselves are pinned in src/game/hud/element-mark.test.ts; this checks both
// rulesets render the HUD with them and without errors.
for (const ff of ['arenaDemo', 'arenaDemo,arcade']) {
  test(`HUD with element marks renders (${ff})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`/?ff=${ff}&manual=1&seed=7`);
    await page.locator('#game canvas').waitFor();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate(`window.__TTE__.arena.step(100)`);
    await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const shot = await page.locator('#game canvas').screenshot();
    expect(shot.length).toBeGreaterThan(1000);
    const dir = process.env['TTE_SHOTS'];
    if (dir) await page.locator('#game canvas').screenshot({ path: `${dir}/${ff.replace(',', '-')}.png` });
    expect(errors).toEqual([]);
  });
}
