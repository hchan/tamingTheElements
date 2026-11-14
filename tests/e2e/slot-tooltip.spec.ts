import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Action-bar tooltips: hovering a box shows its one-line effect above it. Screenshots go to ~/claudetmp/slot-tip for a human look.

const SHOTS = join(homedir(), 'claudetmp', 'slot-tip');

async function start(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('fiara');
  await page.getByLabel('AI race').selectOption('sindarosa');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(100)`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
}

for (const [w, h] of [[1280, 720], [844, 390]] as const) {
  test(`hover tooltip at ${String(w)}x${String(h)}`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await start(page);
    const rects = await page.evaluate<{ x: number; y: number; size: number }[]>(`window.__TTE__.arena.actionBarScreen()`);
    const canvas = await page.locator('canvas').first().boundingBox();
    if (!canvas) throw new Error('no canvas');
    const k = canvas.width / 1280;
    // First box (hero attack, canvas pointer), then a later box (DOM overlay) and the last one (right edge clamp).
    for (const [name, i] of [['first', 0], ['mid', Math.floor(rects.length / 2)], ['last', rects.length - 1]] as const) {
      const r = rects[i];
      if (!r) continue;
      await page.mouse.move(canvas.x + (r.x + r.size / 2) * k, canvas.y + (r.y + r.size / 2) * k);
      await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      await page.screenshot({ path: join(SHOTS, `tip-${name}-${String(w)}x${String(h)}.png`) });
    }
    expect(errors).toEqual([]);
  });
}
