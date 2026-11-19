import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors, tapTourSplash } from './parity/helpers';

// HUD text must not collide (qa-r84 P5): in landscape no two visible HUD texts overlap, and no name is cut to "SIND...".
// Shots go to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];
interface T { text: string; px: number; x: number; y: number; w: number; h: number; ox: number; oy: number }

async function shot(page: Page, name: string): Promise<void> {
  if (shotDir) await page.screenshot({ path: `${shotDir}/${name}.png` });
}

async function enterTour(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#tour`);
  await page.getByRole('button', { name: 'Start tour' }).click();
  await page.getByRole('button', { name: 'Fight' }).click();
  await tapTourSplash(page);
  await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
  await page.evaluate(`window.__TTE__.arena.step(120)`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
}

const rect = (t: T): { l: number; r: number; t: number; b: number } => ({
  l: t.x - t.w * t.ox, r: t.x + t.w * (1 - t.ox), t: t.y - t.h * t.oy, b: t.y + t.h * (1 - t.oy),
});

function overlaps(texts: readonly T[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (!a || !b) continue;
      const p = rect(a), q = rect(b);
      // 2 px slack for the glyph side bearings and stroke.
      if (p.l < q.r - 2 && q.l < p.r - 2 && p.t < q.b - 2 && q.t < p.b - 2) out.push(`"${a.text}" x "${b.text}"`);
    }
  }
  return out;
}

const CASES = [
  { name: '1280x720', w: 1280, h: 720 },
] as const;

for (const c of CASES) {
  test.describe(`HUD text clear ${c.name}`, () => {
    test.use({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 2 });

    test('no two HUD texts overlap, and the Tour names stay whole', async ({ page }) => {
      const errors = collectErrors(page);
      await enterTour(page);
      await shot(page, `tour-${c.name}`);
      const texts = await page.evaluate<T[]>(`window.__TTE__.arena.hudTextSizes()`);
      expect(texts.length).toBeGreaterThan(0);
      expect(overlaps(texts)).toEqual([]);
      expect(errors).toEqual([]);
    });

    test('after several hundred ticks of fighting the HUD texts (life, HURT, SUPER) still do not overlap', async ({ page }) => {
      await enterTour(page);
      let worst = '';
      for (let i = 0; i < 8; i++) {
        await page.evaluate(`window.__TTE__.arena.step(100)`);
        await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
        const texts = await page.evaluate<T[]>(`window.__TTE__.arena.hudTextSizes()`);
        const bad = overlaps(texts);
        if (bad.length > 0) worst = `${bad.join('; ')} [${texts.map((t) => t.text).join(' | ')}]`;
      }
      await shot(page, `tour-fight-${c.name}`);
      expect(worst).toBe('');
    });
  });
}
