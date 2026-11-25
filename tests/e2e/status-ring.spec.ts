import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';
import { waitForArena } from './support/wait';

// Procedural feet rings for freeze (5), slow (6), speed (7), tide (9) and daze (10) (ideas/brainstorm/status-effect-ring-art.md).
// SHOT_DIR=<dir> saves screenshots (headless; never needed to pass).

interface Ring {
  readonly id: number;
  readonly status: number;
  readonly scale: number;
}
const INTRO = 91;
const SHOT_DIR = process.env['SHOT_DIR'];
const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const rings = (page: Page): Promise<readonly Ring[] | undefined> => page.evaluate<readonly Ring[] | undefined>(`window.__TTE__.arena.statusFx().then((s) => s && s.rings)`);

async function start(page: Page): Promise<readonly [number, number]> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('fiara');
  await page.getByLabel('AI race').selectOption('rokcore');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitForArena(page);
  const card = page.getByRole('button', { name: 'Got it' });
  if (await card.isVisible()) await card.click();
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  const ids = await page.evaluate<[number, number]>(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 600, 360, 0); a.place(f.id, 900, 360, 4); return [m.id, f.id]; })()`);
  await frames(page);
  return ids;
}

async function shot(page: Page, name: string, hero?: number): Promise<Buffer> {
  // Attached to the run (so a PC run returns them) and, with SHOT_DIR, saved there too. With a hero id: a tight crop around its feet.
  const canvas = page.locator('#game canvas');
  let clip: { x: number; y: number; width: number; height: number } | undefined;
  if (hero !== undefined) {
    const box = await canvas.boundingBox();
    const at = await page.evaluate<{ x: number; y: number; w: number; h: number; cam: { camZoom: number; scrollX: number } } | undefined>(
      `(async () => { const a = window.__TTE__.arena; const c = a.characters().find((k) => k.id === ${String(hero)}); return c && { x: c.x, y: c.y, w: c.w, h: c.h, cam: await a.camera() }; })()`,
    );
    if (box && at) {
      const k = box.width / 1280;
      const cx = box.x + (at.x + at.w / 2 - at.cam.scrollX) * at.cam.camZoom * k;
      const cy = box.y + (at.y + at.h * 0.8) * at.cam.camZoom * k;
      clip = { x: Math.max(0, cx - 160), y: Math.max(0, cy - 150), width: 320, height: 220 };
    }
  }
  const body = clip ? await page.screenshot({ clip }) : await canvas.screenshot();
  await test.info().attach(name, { body, contentType: 'image/png' });
  if (SHOT_DIR) {
    mkdirSync(SHOT_DIR, { recursive: true });
    writeFileSync(`${SHOT_DIR}/${name}.png`, body);
  }
  return body;
}

/** Number of pixels that differ between two PNG crops (decoded in the page; string form because the e2e tsconfig has no DOM lib). */
function pixelDiff(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate<number>(`(async () => {
    const px = async (b64) => {
      const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
      c.drawImage(bmp, 0, 0);
      return c.getImageData(0, 0, bmp.width, bmp.height).data;
    };
    const p = await px('${a.toString('base64')}');
    const q = await px('${b.toString('base64')}');
    let n = 0;
    for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 12) n++;
    return n;
  })()`);
}

const grant = (page: Page, id: number, status: number, ticks: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.grantStatus(${String(id)}, ${String(status)}, ${String(ticks)})`);

for (const reduced of [false, true]) {
  test(`status rings draw, stack and clear${reduced ? ' (reduced motion)' : ''}`, async ({ page }) => {
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    const [left, right] = await start(page);
    test.setTimeout(150_000);
    const mode = reduced ? 'reduced' : 'loop';
    for (const [id, status] of [[left, 10], [left, 5], [right, 7], [right, 9]] as const) await grant(page, id, status, 140);
    await frames(page);
    await page.evaluate(`window.__TTE__.arena.step(2)`);
    await frames(page);
    await expect.poll(async () => (await rings(page))?.filter((r) => r.id === left).length ?? 0, { message: 'left hero rings' }).toBeGreaterThan(0);
    await page.evaluate(`window.__TTE__.arena.step(20)`);
    await frames(page);
    const mid = await rings(page);
    expect(mid?.filter((r) => r.id === right).map((r) => r.status).sort((a, b) => a - b)).toEqual([7, 9]);
    expect(mid?.filter((r) => r.id === left).map((r) => r.status)).toContain(5);
    expect(mid?.every((r) => [5, 6, 7, 9, 10].includes(r.status))).toBe(true);
    await page.evaluate(`window.__TTE__.arena.step(200)`);
    await frames(page);
    expect(await rings(page)).toEqual([]);
    await page.evaluate(`window.__TTE__.arena.step(40)`);
    await frames(page);
    const none = new Map<number, Buffer>([[left, await shot(page, `none-${mode}`, left)], [right, await shot(page, `none-right-${mode}`, right)]]);
    // Sprite idle motion with no status, over the same 5 ticks used for the speed ring below.
    await page.evaluate(`window.__TTE__.arena.step(5)`);
    await frames(page);
    const noise = await pixelDiff(page, none.get(right) ?? Buffer.alloc(0), await shot(page, `none-later-${mode}`, right));
    test.info().annotations.push({ type: 'idle-noise-px', description: String(noise) });
    // One tile per status (a tight crop on the hero) plus a no-ring control.
    for (const [id, status, name] of [[left, 5, 'freeze'], [left, 6, 'slow'], [right, 7, 'speed'], [right, 9, 'tide'], [left, 10, 'daze']] as const) {
      await grant(page, id, status, 100);
      await frames(page);
      await page.evaluate(`window.__TTE__.arena.step(14)`);
      await frames(page);
      await expect.poll(async () => (await rings(page))?.some((r) => r.id === id && r.status === status), { message: `${name} ring` }).toBe(true);
      const tile = await shot(page, `${name}-${mode}`, id);
      // Pixels: the ring changes the crop around the feet compared with the same hero without a status.
      expect(tile.equals(none.get(id) ?? Buffer.alloc(0)), `${name} crop differs from the no-status crop`).toBe(false);
      if (status === 9) {
        // Reduced motion freezes the tide ripples (its body loop is quiet, so only the ring moves); with motion on they expand (the timer arc still drains a little when reduced, so the bound is a few hundred px, not zero). Measured against the same hero's idle motion over the same 5 ticks.
        await page.evaluate(`window.__TTE__.arena.step(20)`);
        await frames(page);
        const settled = await shot(page, `${name}-settled-${mode}`, id);
        await page.evaluate(`window.__TTE__.arena.step(5)`);
        await frames(page);
        const moved = await pixelDiff(page, settled, await shot(page, `${name}-later-${mode}`, id));
        test.info().annotations.push({ type: 'tide-motion-px', description: String(moved) });
        if (reduced) expect(moved, 'reduced motion: the tide ring holds still').toBeLessThanOrEqual(noise + 600);
        else expect(moved, 'tide ripples move between ticks').toBeGreaterThan(noise + 3000);
      }
      await page.evaluate(`window.__TTE__.arena.step(110)`);
      await frames(page);
      await page.evaluate(`window.__TTE__.arena.step(40)`);
      await frames(page);
    }
    // Stack tile: slow and tide on the same hero.
    for (const st of [6, 9]) await grant(page, right, st, 100);
    await frames(page);
    await page.evaluate(`window.__TTE__.arena.step(14)`);
    await frames(page);
    await expect.poll(async () => (await rings(page))?.filter((r) => r.id === right).map((r) => r.status).sort((a, b) => a - b), { message: 'slow and tide stack' }).toEqual([6, 9]);
    await shot(page, `stack-${mode}`, right);
    expect(errors).toEqual([]);
  });
}

// Long gate (no @smoke): real arena fight, about 20 s. The freeze and daze plates load lazily on first use, with no console errors.
test('freeze and daze plates load lazily and the rings keep drawing', async ({ page }) => {
  const errors = collectErrors(page);
  const plateUrls: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/assets/img/fx/status/') && r.status() === 200) plateUrls.push(r.url());
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  const [left] = await start(page);
  test.setTimeout(150_000);
  expect(plateUrls, 'no plate is fetched before a ring needs it').toEqual([]);
  await grant(page, left, 5, 120);
  await grant(page, left, 10, 120);
  await frames(page);
  await page.evaluate(`window.__TTE__.arena.step(14)`);
  await expect.poll(() => plateUrls.map((u) => /([a-z]+)\.png/.exec(u)?.[1]).sort(), { message: 'plates fetched' }).toEqual(['daze', 'freeze']);
  await frames(page);
  await frames(page);
  expect((await rings(page))?.filter((r) => r.id === left).map((r) => r.status).sort((a, b) => a - b)).toEqual([5, 10]);
  await shot(page, 'plates-freeze-daze', left);
  expect(errors).toEqual([]);
});
