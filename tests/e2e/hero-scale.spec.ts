import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Hero size on screen (qa-hero-scale-small): at the framing the pan camera settles on, a normal hero fills a fighting-game share
// of the picture height. Measured from the hook (sim box height x display scale x camera zoom) against the arena height.
const SHOT_DIR = process.env['HERO_SHOT_DIR'];

for (const [w, h] of [[1280, 720], [1920, 1080]] as const) {
  test(`Arcade hero is at least 18% of the picture height at ${String(w)}x${String(h)}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate(`window.__TTE__.arena.step(91)`);
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 800, 380, 0); a.place(foe.id, 1000, 380, 4); })()`);
    await expect.poll(async () => page.evaluate<number>(`window.__TTE__.arena.camera().then((c) => c.camZoom)`), { timeout: 10_000 }).toBeGreaterThan(0.9);
    const frac = await page.evaluate<number>(`window.__TTE__.arena.camera().then((c) => (80 * 2 * c.zoom) / 720)`);
    if (SHOT_DIR !== undefined) await page.screenshot({ path: `${SHOT_DIR}/hero-${String(w)}.png` });
    expect(frac).toBeGreaterThanOrEqual(0.18);
    expect(errors).toEqual([]);
  });
}
