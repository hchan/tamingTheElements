import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Portrait phone play (html[data-portrait-play]) caps the status chips per fighter at PORTRAIT_CHIP_MAX (2 slots: the first chip, then a
// "+N more" chip standing in for the rest). Shots go to $SHOT_DIR when set.
const SHOT_DIR = process.env['SHOT_DIR'];
const ATTR = `document.documentElement.hasAttribute('data-portrait-play')`;
const INTRO = 91;
const STATUSES = [2, 3, 4, 5]; // four timed statuses, all with a chip word
const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

interface Txt { text: string; px: number; x: number; y: number; w: number; h: number }
const overlap = (a: Txt, b: Txt): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test.describe('portrait +N more status chip', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('three or more statuses show one chip plus "+N more", clear of the other HUD text', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByRole('button', { name: /^Fight/ }).tap();
    await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
    await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
    await page.waitForFunction(ATTR);
    const card = page.getByRole('button', { name: 'Got it' });
    if (await card.isVisible()) await card.tap();
    await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
    const id = await page.evaluate<number>(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 600, 360, 0); a.place(f.id, 900, 360, 4); return m.id; })()`);
    for (const s of STATUSES) await page.evaluate(`window.__TTE__.arena.grantStatus(${String(id)}, ${String(s)}, 900)`);
    await page.evaluate(`window.__TTE__.arena.step(4)`);
    await frames(page);

    const texts = await page.evaluate<Txt[]>(`window.__TTE__.arena.hudTextSizes()`);
    const all = texts.map((t) => `${t.text}@${String(Math.round(t.x))},${String(Math.round(t.y))}`).join(' | ');
    const more = texts.filter((t) => /^\+\d+ more$/.test(t.text));
    expect(more, `exactly one "+N more" chip (only the player has statuses): ${all}`).toHaveLength(1);
    const m = more[0] as Txt;
    expect(m.text).toBe(`+${String(STATUSES.length - 1)} more`);
    // The one real chip ("<glyph> WORD 18s") is on the same side; at portrait width the chips stack, so "+N more" sits on the row below it.
    const row = texts.filter((t) => t !== m && /^[▲▼] \S.* \d+s$/.test(t.text) && Math.abs(t.x - m.x) < 2);
    expect(row.length, `one status chip above "+N more": ${all}`).toBe(1);
    const chip = row[0] as Txt;
    expect(overlap(chip, m)).toBe(false);
    expect(m.y, 'the more chip is below the chip, not on top of it').toBeGreaterThanOrEqual(chip.y + chip.h - 1);
    // Nothing else drawn as HUD text overlaps either chip.
    for (const t of texts) {
      if (t === m || t === chip) continue;
      expect(overlap(t, m), `"${t.text}" overlaps the more chip`).toBe(false);
      expect(overlap(t, chip), `"${t.text}" overlaps the status chip`).toBe(false);
    }
    const canvas = await page.evaluate<{ w: number }>(`(() => { const r = document.querySelector('#game canvas').getBoundingClientRect(); return { w: r.width }; })()`);
    expect(m.x + m.w).toBeLessThanOrEqual(canvas.w + 1);

    if (SHOT_DIR) {
      mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${SHOT_DIR}/more-chip-390x844.png` });
    }
    // Once the statuses have run out there is no "+N more".
    await page.evaluate(`window.__TTE__.arena.step(1000)`);
    await frames(page);
    const after = await page.evaluate<Txt[]>(`window.__TTE__.arena.hudTextSizes()`);
    expect(after.some((t) => /more$/.test(t.text))).toBe(false);
    expect(errors).toEqual([]);
  });
});
