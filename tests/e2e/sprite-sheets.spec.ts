import { expect, test, type Page } from '@playwright/test';
import { encodePng } from '../../tools/assets/png-lite';
import { ARENA_READY } from './parity/helpers';

// Sprite sheets in the view (FUN-DESIGN 2.16 step 3). The shipped manifest has no atlases, so a real match must load
// nothing and draw the legacy art. With a test-only manifest (window.__TTE_SHEETS__, read by dev and test builds only) and
// a fixture atlas generated here and served by page.route (never written to public/ or the build), Curomo is drawn from
// the sheet: its own row facing east, the mirrored east row facing west, and the legacy art where no row exists.
// Page-side code is passed as strings because tsconfig.node has no DOM lib.

const FRAME = 80;
/** idle/E (4 frames) then walk/E (4 frames) on one 640x80 shelf, each frame a solid colour. */
function fixtureAtlas(): Buffer {
  const w = FRAME * 8;
  const data = new Uint8Array(w * FRAME * 4);
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < w; x++) data.set([40 + 25 * Math.floor(x / FRAME), 200, 90, 255], (y * w + x) * 4);
  }
  return Buffer.from(encodePng({ width: w, height: FRAME, data }));
}
const frames = (x0: number): [number, number][] => [0, 1, 2, 3].map((i) => [x0 + i * FRAME, 0]);
const FIXTURE_MANIFEST = {
  spec: { frame: FRAME, maxSize: 2048, dirs: [], actions: [] },
  sheets: [
    { sprite: 'curomo', url: 'img/sheets/curomo.png', width: FRAME * 8, height: FRAME, rows: [
      { key: 'idle/E', frames: frames(0) },
      { key: 'walk/E', frames: frames(FRAME * 4) },
    ] },
  ],
};

interface Drawn { id: number; texture: string; frame: string; flipX: boolean; rotation: number }
interface SheetProbe { loaded: string[]; characters: Drawn[] }

const probe = (page: Page): Promise<SheetProbe | undefined> => page.evaluate<SheetProbe | undefined>('window.__TTE__.arena.sheets()');

function collect(page: Page): { errors: string[]; sheetRequests: string[] } {
  const errors: string[] = [];
  const sheetRequests: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (r.url().includes('/img/sheets/')) sheetRequests.push(r.url()); });
  return { errors, sheetRequests };
}

/** Classic demo (Curomo vs Pax), stepped once so both are drawn; returns Curomo's entity id. */
async function openDemo(page: Page): Promise<number> {
  await page.goto('/?ff=arenaDemo&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate('window.__TTE__.arena.step(1)');
  await expect.poll(async () => (await probe(page))?.characters.length ?? 0).toBe(2);
  const drawn = (await probe(page))?.characters ?? [];
  const curomo = drawn.find((c) => c.texture.endsWith(':curomo'));
  expect(curomo, JSON.stringify(drawn)).toBeDefined();
  return curomo?.id ?? -1;
}

/**
 * Pins the character at one spot facing `dir` while the sim keeps ticking for ~40 rendered frames, so the view sees it
 * standing (the walk blend only settles while ticks advance: a manually stepped sim counts as paused between steps).
 */
async function face(page: Page, id: number, dir: number): Promise<void> {
  await page.evaluate(`(async () => {
    const a = window.__TTE__.arena;
    for (let k = 0; k < 40; k++) {
      a.step(1);
      a.place(${String(id)}, 200, 380, ${String(dir)});
      await new Promise((r) => requestAnimationFrame(r));
    }
  })()`);
}
const drawnAs = async (page: Page, id: number): Promise<Drawn | undefined> => (await probe(page))?.characters.find((c) => c.id === id);

test('the shipped manifest only loads atlases of characters in the match (the demo has Fiara, Pax and Curomo: all rigged, none drawn from legacy)', async ({ page }) => {
  const { errors, sheetRequests } = collect(page);
  await openDemo(page);
  for (let i = 0; i < 3; i++) await page.evaluate('window.__TTE__.arena.step(10)');
  const p = await probe(page);
  expect(p?.loaded.filter((s) => s !== 'fiara' && s !== 'pax' && s !== 'curomo')).toEqual([]);
  expect(p?.characters.map((c) => c.texture).filter((t) => !t.endsWith(':fiara') && !t.endsWith(':pax') && !t.endsWith(':curomo')).sort()).toEqual([]);
  expect(sheetRequests.every((u) => u.endsWith('img/sheets/fiara.png') || u.endsWith('img/sheets/pax.png') || u.endsWith('img/sheets/curomo.png'))).toBe(true);
  expect(errors).toEqual([]);
});

test('a fixture sheet: own row, mirrored row, legacy fallback, and only the characters in the match are loaded', async ({ page }) => {
  const { errors, sheetRequests } = collect(page);
  const png = fixtureAtlas();
  await page.route('**/assets/img/sheets/curomo.png', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  await page.addInitScript(`window.__TTE_SHEETS__ = ${JSON.stringify(FIXTURE_MANIFEST)};`);
  const id = await openDemo(page);

  await expect.poll(async () => (await probe(page))?.loaded).toEqual(['curomo']);
  // Facing east: the own idle row, upright (the sheet replaces the procedural lean and breathing).
  await face(page, id, 0);
  await expect.poll(() => drawnAs(page, id)).toMatchObject({ texture: 'sheet:curomo', frame: expect.stringMatching(/^idle\/E#[0-3]$/), flipX: false, rotation: 0 });
  // Facing west: no idle/W row, so the east row mirrored.
  await face(page, id, 4);
  await expect.poll(() => drawnAs(page, id)).toMatchObject({ texture: 'sheet:curomo', frame: expect.stringMatching(/^idle\/E#[0-3]$/), flipX: true });
  // A direction with no row and nothing to mirror: the legacy art, exactly as before.
  await face(page, id, 2);
  await expect.poll(async () => (await drawnAs(page, id))?.texture).toBe('map:curomo');
  // Pax has no sheet: never requested, always legacy.
  const pax = (await probe(page))?.characters.find((c) => c.id !== id);
  expect(pax?.texture).toBe('map:pax');
  expect(sheetRequests.map((u) => u.replace(/^.*\/assets\//, ''))).toEqual(['img/sheets/curomo.png']);
  expect(errors).toEqual([]);
});

test('Morblass (?p1=morblass) is drawn from its rigged atlas in the real game', async ({ page }, info) => {
  const { errors } = collect(page);
  await page.goto('/?ff=arenaDemo&manual=1&seed=7&p1=morblass');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate('window.__TTE__.arena.step(1)');
  await expect.poll(async () => (await probe(page))?.characters.length ?? 0).toBe(2);
  const morb = (await probe(page))?.characters.find((c) => c.texture.endsWith(':morblass'));
  expect(morb, JSON.stringify((await probe(page))?.characters)).toBeDefined();
  const id = morb?.id ?? -1;
  await face(page, id, 0);
  await expect.poll(async () => (await drawnAs(page, id))?.texture).toBe('sheet:morblass');
  await page.screenshot({ path: info.outputPath('morblass-idle-e.png') });
  await face(page, id, 7);
  await expect.poll(async () => (await drawnAs(page, id))?.frame).toMatch(/^idle\/SE#[0-3]$/);
  await page.screenshot({ path: info.outputPath('morblass-idle-se.png') });
  expect(errors).toEqual([]);
});

for (const sprite of ['rokcore', 'curomo', 'lavax', 'sindarosa']) {
  test(`${sprite} (?p1=${sprite}) is drawn from its rigged atlas in the real game`, async ({ page }, info) => {
    const { errors } = collect(page);
    await page.goto(`/?ff=arenaDemo&manual=1&seed=7&p1=${sprite}`);
    await page.locator('#game canvas').waitFor();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate('window.__TTE__.arena.step(1)');
    await expect.poll(async () => (await probe(page))?.characters.length ?? 0).toBe(2);
    const ch = (await probe(page))?.characters.find((c) => c.texture.endsWith(`:${sprite}`));
    expect(ch, JSON.stringify((await probe(page))?.characters)).toBeDefined();
    const id = ch?.id ?? -1;
    await face(page, id, 0);
    await expect.poll(async () => (await drawnAs(page, id))?.texture).toBe(`sheet:${sprite}`);
    await page.screenshot({ path: info.outputPath(`${sprite}-idle-e.png`) });
    await face(page, id, 7);
    await expect.poll(async () => (await drawnAs(page, id))?.frame).toMatch(/^idle\/SE#[0-3]$/);
    await page.screenshot({ path: info.outputPath(`${sprite}-idle-se.png`) });
    expect(errors).toEqual([]);
  });
}
