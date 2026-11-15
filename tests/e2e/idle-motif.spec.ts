import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Idle body motifs (idea idle-element-auras, IA3): a standing hero moves a little in its own way (treenoc sways, sindarosa
// flexes its wings); walking and reduced motion add nothing. Checked through the sheets probe (wall-clock animation, so bounds
// not pixels). Headless only.
interface Drawn { id: number; motif: string; motifRot: number; motifOy: number; motifAlpha: number }
const probe = (page: Page): Promise<Drawn[]> =>
  page.evaluate<Drawn[]>(`window.__TTE__.arena.sheets().then((s) => (s ? s.characters : []))`);

async function start(page: Page, hero: string): Promise<void> {
  await page.goto(`/?ff=arenaDemo,arcade&seed=7&hero=${hero}&foe=dummy`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
}

/** Largest |value| of the first character over about 1.7 s of frames (the motifs move on a 1.4-3.2 s period). */
async function peak(page: Page, key: 'motifRot' | 'motifOy', ms = 1700, skipMs = 0): Promise<number> {
  return page.evaluate<number>(`(async () => {
    let best = 0;
    const t0 = performance.now();
    const end = t0 + ${String(ms)};
    while (performance.now() < end) {
      const s = await window.__TTE__.arena.sheets();
      const c = s && s.characters[0];
      if (c && performance.now() - t0 >= ${String(skipMs)}) best = Math.max(best, Math.abs(c.${key}));
      await new Promise((r) => requestAnimationFrame(r));
    }
    return best;
  })()`);
}

test('a standing treenoc sways within bounds', async ({ page }) => {
  await start(page, 'treenoc');
  const [c] = await probe(page);
  expect(c?.motif).toBe('sway');
  const rot = await peak(page, 'motifRot');
  expect(rot).toBeGreaterThan(0.1);
  expect(rot).toBeLessThanOrEqual(1.5);
});

test('a standing sindarosa flexes its wings (rot and lift), within bounds', async ({ page }) => {
  await start(page, 'sindarosa');
  const rot = await peak(page, 'motifRot');
  expect(rot).toBeGreaterThan(0.05);
  expect(rot).toBeLessThanOrEqual(1.5);
  const [c] = await probe(page);
  expect(c?.motif).toBe('wingFlex');
  expect(Math.abs(c?.motifOy ?? 0)).toBeLessThanOrEqual(1.5);
});

test('a walking hero has no motif', async ({ page }) => {
  await start(page, 'treenoc');
  expect(await peak(page, 'motifRot', 1600)).toBeGreaterThan(0.1); // the round intro holds it; it stands and sways
  await page.keyboard.down('KeyD');
  // the walk eases in over a few hundred ms; the motif fades out with it
  expect(await peak(page, 'motifRot', 1000, 400)).toBeLessThan(0.5);
  await page.keyboard.up('KeyD');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('no idle motif', async ({ page }) => {
    await start(page, 'treenoc');
    expect(await peak(page, 'motifRot')).toBe(0);
    expect(await peak(page, 'motifOy')).toBe(0);
  });
});
