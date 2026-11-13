import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Presentation of the weak ability visuals the audit found (ideas/done/ability-graphics-audit-defects.md): Rock Armour,
// Adrenaline and Fire Dance get an aura, Fire Heal a pop even at full HP; Rock Pellet, Strangling Branches and Crimson Fire a
// contrast halo. SHOT_DIR=<dir> also saves screenshots 1, 5 and 10 ticks after each cast (headless; never needed to pass).

interface AuraProbe {
  readonly auras: readonly { id: number; kind: string; shape: string }[];
  readonly pops: readonly { id: number; word: string }[];
  readonly lashes: readonly { team: number; age: number }[];
}
const INTRO = 91;
const PRIMARY = 16;
const SECONDARY = 32;
const SHOT_DIR = process.env['SHOT_DIR'];

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const probe = (page: Page): Promise<AuraProbe | undefined> => page.evaluate<AuraProbe | undefined>(`window.__TTE__.arena.abilityFx()`);

async function start(page: Page, me: string, foe: string, gap: number): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption(me);
  await page.getByLabel('AI race').selectOption(foe);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 700, 360, 0); a.place(f.id, ${String(700 + gap)}, 360, 4); })()`);
  // The aura view detects a cast by comparing the cooldown it saw on the previous render with this one. Make sure a render has
  // sampled the pre-cast state; on a loaded machine the first render could otherwise come after the cast and see no change.
  await frames(page);
}

async function shots(page: Page, name: string, command: number): Promise<void> {
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(command)}, 0])`);
  let done = 1;
  for (const at of [1, 5, 10]) {
    await page.evaluate(`window.__TTE__.arena.step(${String(at - done)})`);
    done = at;
    await frames(page);
    if (SHOT_DIR) {
      mkdirSync(SHOT_DIR, { recursive: true });
      await page.locator('#game canvas').screenshot({ path: `${SHOT_DIR}/${name}-${String(at)}.png` });
    }
  }
}

const CASES = [
  { name: 'rock-pellet', me: 'rokcore', gap: 600, cmd: SECONDARY },
  { name: 'rock-armour', me: 'rokcore', gap: 800, cmd: PRIMARY },
  { name: 'adrenaline', me: 'pax', gap: 800, cmd: PRIMARY },
  { name: 'strangling-branches', me: 'treenoc', gap: 150, cmd: SECONDARY },
  { name: 'fire-heal', me: 'fiara', gap: 800, cmd: PRIMARY },
  { name: 'fire-dance', me: 'lavax', gap: 800, cmd: SECONDARY },
  { name: 'snag-treenoc', me: 'treenoc', gap: 500, cmd: PRIMARY },
  { name: 'snag-curomo', me: 'curomo', gap: 500, cmd: SECONDARY },
  { name: 'snag-echo', me: 'echo', gap: 500, cmd: PRIMARY },
  { name: 'crimson-fire', me: 'lavax', gap: 600, cmd: PRIMARY },
] as const;

for (const c of CASES) {
  test(`${c.name}: cast shots, no page errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await start(page, c.me, 'sindarosa', c.gap);
    await shots(page, c.name, c.cmd);
    expect(errors).toEqual([]);
  });
}

const BUFFS = [
  { name: 'rock-armour', me: 'rokcore', cmd: PRIMARY, kind: 'rockArmour', shape: 'plates' },
  { name: 'adrenaline', me: 'pax', cmd: PRIMARY, kind: 'adrenaline', shape: 'chevrons' },
  { name: 'fire-dance', me: 'lavax', cmd: SECONDARY, kind: 'fireDance', shape: 'flames' },
] as const;

for (const b of BUFFS) {
  test(`${b.name}: aura of its own shape while the buff runs, gone after`, async ({ page }) => {
    await start(page, b.me, 'sindarosa', 900);
    await shots(page, `aura-${b.name}`, b.cmd);
    const live = await probe(page);
    expect(live?.auras.map((a) => [a.kind, a.shape])).toContainEqual([b.kind, b.shape]);
    await page.evaluate(`window.__TTE__.arena.step(400)`);
    await frames(page);
    expect((await probe(page))?.auras.some((a) => a.kind === b.kind)).toBe(false);
  });
}

test('fire heal: a HEAL word pops over the caster even at full HP', async ({ page }) => {
  await start(page, 'fiara', 'sindarosa', 900);
  await shots(page, 'aura-fire-heal', PRIMARY);
  expect((await probe(page))?.pops.map((p) => p.word)).toContain('HEAL');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the Rock Armour aura is still drawn, static', async ({ page }) => {
    await start(page, 'rokcore', 'sindarosa', 900);
    await shots(page, 'aura-reduced', PRIMARY);
    expect((await probe(page))?.auras.map((a) => a.kind)).toContain('rockArmour');
  });
});

test('snag: a rope lash and a SNAG word show on the cast, before any hit', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, 'treenoc', 'sindarosa', 900);
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(PRIMARY)}, 0])`);
  await frames(page);
  const p = await probe(page);
  expect(p?.lashes.length).toBe(1);
  expect(p?.pops.map((x) => x.word)).toContain('SNAG');
  await page.evaluate(`window.__TTE__.arena.step(40)`);
  await frames(page);
  expect((await probe(page))?.lashes).toEqual([]);
  expect(errors).toEqual([]);
});

const SUPER = 1 << 13;
const ELEMENT_SHAPES = [
  { race: 'lavax', element: 'fire', shape: 'star' },
  { race: 'curomo', element: 'water', shape: 'rings' },
  { race: 'cyclonius', element: 'air', shape: 'swirl' },
  { race: 'rokcore', element: 'earth', shape: 'squares' },
] as const;

for (const e of ELEMENT_SHAPES) {
  test(`super (${e.race}): a ${e.shape} burst of its own shape shows and clears`, async ({ page }) => {
    const errors = collectErrors(page);
    await start(page, e.race, 'sindarosa', 500);
    await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setMeter(0, 1000); a.step(1, [${String(SUPER)}, 0]); a.step(10); })()`);
    const read = (): Promise<{ element: string; shape: string; age: number; paths: number } | undefined> =>
      page.evaluate(`window.__TTE__.arena.superBurst()`);
    await expect.poll(async () => (await read())?.shape).toBe(e.shape);
    expect((await read())?.element).toBe(e.element);
    if (SHOT_DIR) {
      mkdirSync(SHOT_DIR, { recursive: true });
      await frames(page);
      await page.locator('#game canvas').screenshot({ path: `${SHOT_DIR}/super-${e.race}-10.png` });
    }
    await page.evaluate(`window.__TTE__.arena.step(90)`);
    await frames(page);
    expect(await read()).toBeUndefined();
    expect(errors).toEqual([]);
  });
}
