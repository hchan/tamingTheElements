import { expect, test } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';

// Tour stage card scannability: four short Label: value rows, no filler sentence, a Fight button of at least 44 px, no banned words,
// and the whole card from title through Fight inside a 667x375 phone landscape viewport. SHOT_DIR (optional) saves screenshots.
for (const [name, width, height] of [['desktop', 1280, 720], ['phone', 667, 375], ['phone-wide', 844, 390]] as const) {
  test(`Tour stage card is scannable at ${name} ${String(width)}x${String(height)}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width, height });
    await page.goto(`${START}&ff=arcade#tour`);
    await page.getByLabel('Hero 1 (lead)').selectOption('fiara');
    await page.getByLabel('Hero 2').selectOption('rokcore');
    await page.getByLabel('Hero 3').selectOption('curomo');
    await page.getByRole('button', { name: 'Start tour' }).click();
    const card = page.locator('#tourStage');
    await expect(card.locator('.tourFact')).toHaveCount(4);
    await expect(card.locator('.tsPanel')).toBeVisible();
    await expect(card).not.toContainText('Press Fight');
    const text = (await card.textContent()) ?? '';
    expect(text).not.toMatch(/classic|arcade|ruleset|capture/i);
    const fight = await page.locator('#tourFight').boundingBox();
    expect(fight?.height).toBeGreaterThanOrEqual(44);
    expect((fight?.y ?? 0) + (fight?.height ?? 0)).toBeLessThanOrEqual(height);
    // QA r40: wait for the enhanced card, then no caption runs into its neighbour, the team strip stays inside the panel, and the title is not scrolled off.
    await page.locator('#tourStage .tsTeam .tsMine').first().waitFor();
    await page.waitForFunction("getComputedStyle(document.querySelector('#tourStage')).opacity === '1'");
    const m = await page.evaluate<{ rects: number[][]; panel: number[]; teamRight: number; h1Top: number; sy: number; fightBottom: number }>(`(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      const caps = [...document.querySelectorAll('#tourStage .tsFoe figcaption')].map((c) => {
        const range = document.createRange(); range.selectNodeContents(c); const b = range.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom];
      });
      const mine = [...document.querySelectorAll('#tourStage .tsMine')];
      return { rects: caps, panel: r(document.querySelector('#tourStage .tsPanel')), teamRight: Math.max(...mine.map((e) => e.getBoundingClientRect().right)),
        h1Top: document.querySelector('#tourStage h1').getBoundingClientRect().top, sy: scrollY, fightBottom: document.querySelector('#tourFight').getBoundingClientRect().bottom };
    })()`);
    for (let i = 0; i < m.rects.length; i++) {
      for (let j = i + 1; j < m.rects.length; j++) {
        const [al = 0, at = 0, ar = 0, ab = 0] = m.rects[i] ?? [];
        const [bl = 0, bt = 0, br = 0, bb = 0] = m.rects[j] ?? [];
        expect(al < br && bl < ar && at < bb && bt < ab, `captions ${String(i)} and ${String(j)} overlap`).toBe(false);
      }
    }
    expect(m.teamRight).toBeLessThanOrEqual(m.panel[2] ?? 0);
    expect(m.h1Top).toBeGreaterThanOrEqual(0);
    expect(m.sy).toBe(0);
    expect(m.fightBottom).toBeLessThanOrEqual(height);
    const dir = process.env['SHOT_DIR'];
    if (dir) await page.screenshot({ path: `${dir}/tour-card-${name}.png` });
    expect(errors).toEqual([]);
  });
}
