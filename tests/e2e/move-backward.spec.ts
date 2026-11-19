import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, collectErrors } from './parity/helpers';

// Backward walk (idea backward-walk-animation, Phase 1): backing away from the foe plays the walk row reversed and adds a
// per-hero lean/hover cue; walking toward the foe is unchanged. A real-time Arcade match against a still dummy, the hero
// holding the key that walks away from it; $SHOT_DIR keeps the screenshot sequences. Page code is passed as strings (no DOM lib).

test.describe.configure({ timeout: 150000 });

interface Sample { frame: string; back: number; rotation: number }
interface Drawn { id: number; texture: string; frame: string; flipX: boolean; rotation: number; back: number }
interface Probe { loaded: string[]; characters: Drawn[] }

const probe = (page: Page): Promise<Probe | undefined> => page.evaluate<Probe | undefined>('window.__TTE__.arena.sheets()');

/** Opens the match; resolves the id of the hero and the keys that walk away from and toward the dummy. */
async function open(page: Page, hero: string): Promise<{ id: number; away: string; toward: string }> {
  await page.goto(`/?ff=arenaDemo,arcade&seed=7&hero=${hero}&foe=dummy`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`new Promise((r) => { let n = 0; const f = () => (++n > 150 ? r(true) : requestAnimationFrame(f)); f(); })`);
  const chars = await page.evaluate<{ id: number; team: number; x: number }[]>('window.__TTE__.arena.characters()');
  const me = chars.find((c) => c.team === 0);
  const foe = chars.find((c) => c.team === 1);
  expect(me && foe, JSON.stringify(chars)).toBeTruthy();
  const west = (me?.x ?? 0) < (foe?.x ?? 0);
  return { id: me?.id ?? -1, away: west ? 'KeyA' : 'KeyD', toward: west ? 'KeyD' : 'KeyA' };
}

/** Samples the hero once per rendered frame for `n` frames. */
function sample(page: Page, id: number, n: number): Promise<Sample[]> {
  return page.evaluate<Sample[]>(`(async () => {
    const out = [];
    for (let k = 0; k < ${String(n)}; k++) {
      const p = await window.__TTE__.arena.sheets();
      const c = p && p.characters.find((d) => d.id === ${String(id)});
      if (c) out.push({ frame: c.frame, back: c.back, rotation: c.rotation });
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  })()`);
}

/** Distinct consecutive walk-row frame indices, in order. */
function walkOrder(samples: Sample[]): number[] {
  const seq: number[] = [];
  for (const s of samples) {
    const m = /^walk\/[A-Z]+#(\d)$/.exec(s.frame);
    if (!m) continue;
    const k = Number(m[1]);
    if (seq[seq.length - 1] !== k) seq.push(k);
  }
  return seq;
}
/** Every move is `d` frames (+1 forward, -1 reversed), a sampling miss may skip one; most moves are single steps. */
const steps = (seq: number[], d: number): boolean => {
  const deltas = seq.slice(1).map((k, i) => ((((k - (seq[i] ?? 0)) * d) % 4) + 4) % 4);
  // Slow headless sampling skips frames and can catch a stray idle frame, so require a clear majority in direction `d`, not purity.
  const ahead = deltas.filter((x) => x === 1).length;
  const opposite = deltas.filter((x) => x === 3).length;
  return seq.length >= 3 && ahead >= 2 && ahead >= opposite * 3;
};

async function shots(page: Page, tag: string, n: number): Promise<void> {
  const dir = process.env['SHOT_DIR'];
  if (!dir) return;
  const box = await page.locator('#game canvas').boundingBox();
  const clip = box && { x: box.x + box.width * 0.25, y: box.y + box.height * 0.25, width: box.width * 0.5, height: box.height * 0.5 };
  for (let i = 0; i < n; i++) {
    await page.screenshot({ path: `${dir}/${tag}-${String(i)}.png`, ...(clip && { clip }) });
    await page.evaluate(`new Promise((r) => { let k = 0; const f = () => (++k > 4 ? r(true) : requestAnimationFrame(f)); f(); })`);
  }
}

for (const hero of ['pax', 'sindarosa', 'ishimi', 'wispera']) {
  test(`backing away: ${hero} plays the walk reversed and leans; walking toward is forward`, async ({ page }) => {
    const errors = collectErrors(page);
    const { id, away, toward } = await open(page, hero);

    await page.keyboard.down(away);
    await expect.poll(async () => (await probe(page))?.characters.find((c) => c.id === id)?.back ?? 0, { timeout: 8000 }).toBeGreaterThan(0.9);
    const back = await sample(page, id, 60);
    await shots(page, `back-${hero}`, 8);
    await page.keyboard.up(away);

    expect(steps(walkOrder(back.filter((s) => s.back > 0.9)), -1), JSON.stringify(walkOrder(back.filter((s) => s.back > 0.9)))).toBe(true);
    if (hero === 'pax') expect(Math.max(...back.filter((s) => s.back > 0.9).map((s) => s.rotation))).toBeLessThan(0);

    await page.keyboard.down(toward);
    await expect.poll(async () => (await probe(page))?.characters.find((c) => c.id === id)?.back ?? 1, { timeout: 8000 }).toBeLessThan(0.05);
    const fwd = await sample(page, id, 60);
    await shots(page, `fwd-${hero}`, 8);
    await page.keyboard.up(toward);
    expect(steps(walkOrder(fwd.filter((s) => s.back < 0.05)), 1), JSON.stringify(walkOrder(fwd.filter((s) => s.back < 0.05)))).toBe(true);
    expect(errors).toEqual([]);
  });
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('backing away still plays the walk reversed, with no rotation', async ({ page }) => {
    const errors = collectErrors(page);
    const { id, away } = await open(page, 'pax');
    await page.keyboard.down(away);
    await expect.poll(async () => (await probe(page))?.characters.find((c) => c.id === id)?.back ?? 0, { timeout: 8000 }).toBeGreaterThan(0.9);
    const back = await sample(page, id, 60);
    await page.keyboard.up(away);
    expect(steps(walkOrder(back.filter((s) => s.back > 0.9)), -1), JSON.stringify(walkOrder(back.filter((s) => s.back > 0.9)))).toBe(true);
    expect(back.every((s) => s.rotation === 0)).toBe(true);
    expect(errors).toEqual([]);
  });
});
