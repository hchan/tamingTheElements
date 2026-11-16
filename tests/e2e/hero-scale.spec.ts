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

// WALL-3a: a hero pinned at either wall is drawn inside the arena on every frame. The sprite is tucked inside the wall, but the
// pose rotation and the hit recoil/lunge shove are applied after the tuck; the view clamps the rotated body box last.
interface WallRow { id: number; rotation: number; boxL: number; boxR: number }
for (const [name, meX, meDir, foeX, foeDir] of [['left', 0, 0, 200, 4], ['right', 1840, 4, 1560, 0]] as const) {
  test(`a hero pinned at the ${name} wall is drawn inside the arena on every frame (WALL-3a)`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate(`window.__TTE__.arena.step(91)`);
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, ${String(meX)}, 380, ${String(meDir)}); a.place(foe.id, ${String(foeX)}, 380, ${String(foeDir)}); })()`);
    let rows = 0;
    let hits = 0;
    let leaned = 0;
    let spill = 0;
    for (let i = 0; i < 250; i++) {
      // read the hero's HP (a drop is a hit), heal it so it keeps fighting at the wall, then advance two ticks
      const hit = await page.evaluate<boolean>(`(() => { const a = window.__TTE__.arena; const [me] = a.characters(); const hurt = me.hp < me.maxHp; a.setHp(me.id, me.maxHp); a.stepLive(2); return hurt; })()`);
      if (hit) hits++;
      await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const me = await page.evaluate<number>(`window.__TTE__.arena.characters()[0].id`);
      const sheets = await page.evaluate<{ characters: WallRow[] } | undefined>(`window.__TTE__.arena.sheets()`);
      for (const r of sheets?.characters ?? []) {
        if (r.id !== me) continue;
        rows++;
        if (Math.abs(r.rotation) >= 0.02) leaned++;
        if (r.boxL < -0.5 || r.boxR > 1920.5) spill++;
      }
    }
    expect(spill, 'frames with the drawn box past a wall').toBe(0);
    expect(rows).toBeGreaterThanOrEqual(100);
    expect(hits).toBeGreaterThanOrEqual(3);
    expect(leaned).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}
