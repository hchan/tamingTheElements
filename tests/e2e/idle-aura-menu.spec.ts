import { expect, test } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';

// Hero select idle aura (CSS only): the focused portrait carries one aura layer pair per element; static under reduced motion.
const PICKS: ReadonlyArray<readonly [string, RegExp, string]> = [
  ['fire', /^Fiara/, 'fire'],
  ['air', /^Echo/, 'air'],
  ['earth', /^Rokcore/, 'earth'],
  ['water', /^Ishimi/, 'water'],
];

test.use({ deviceScaleFactor: process.env['SHOT_DIR'] ? 4 : 1 });

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`hero select idle aura per element (${motion})`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto(`${START}&ff=arcade#tour`);
    for (const [name, label, element] of PICKS) {
      await page.locator('.heroTile').filter({ hasText: label }).click();
      const portrait = page.locator('.heroPanel .heroPortrait');
      await expect(portrait).toBeVisible();
      const probe = await page.evaluate<{ el: string | null; before: string; anim: string; pe: string }>(
        `(() => { const n = document.querySelector('.heroPanel .heroPortrait'); const c = getComputedStyle(n, '::before'); return { el: n.closest('.heroPanel').getAttribute('data-element'), before: c.content, anim: c.animationName, pe: c.pointerEvents }; })()`,
      );
      expect(probe.el).toBe(element);
      expect(probe.before).toBe('""');
      expect(probe.pe).toBe('none');
      if (motion === 'reduce') expect(probe.anim).toBe('none');
      else expect(probe.anim).not.toBe('none');
      // The portrait itself breathes (menu-motion.css), so it is never "stable": clip the page instead.
      const box = await portrait.boundingBox();
      if (process.env['SHOT_DIR'] && box) await page.screenshot({ clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 }, path: `${process.env['SHOT_DIR']}/idle-aura-${name}-${motion}.png` });
    }
    expect(errors).toEqual([]);
  });
}
