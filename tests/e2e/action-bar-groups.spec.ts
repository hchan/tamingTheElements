import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Grouped action bar prototype (docs/design/action-bar-kits.md): `?ff=barGroups` re-lays the same boxes into HERO / COMMON / TEAM with
// the same keys; every box stays inside the canvas at 1280x720 and 800x450. Screenshots go to ~/claudetmp/bar-groups for a human look.

const SHOTS = join(homedir(), 'claudetmp', 'bar-groups');

async function start(page: Page, ff: string): Promise<void> {
  await page.goto(`${START}&ff=${ff}#arcade`);
  await page.getByLabel('Your race').selectOption('fiara');
  await page.getByLabel('AI race').selectOption('sindarosa');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(100)`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
}

for (const [w, h] of [[1280, 720], [800, 450]] as const) {
  test(`grouped bar at ${String(w)}x${String(h)}: labelled groups, boxes inside the canvas`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await start(page, 'arcade,barGroups');
    const rects = await page.evaluate<{ x: number; y: number; size: number }[]>(`window.__TTE__.arena.actionBarScreen()`);
    expect(rects.length).toBeGreaterThanOrEqual(8);
    await page.screenshot({ path: join(SHOTS, `grouped-${String(w)}x${String(h)}.png`) });
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1);
      expect(r.x + r.size).toBeLessThanOrEqual(1281);
      expect(r.y + r.size).toBeLessThanOrEqual(721);
    }
    await start(page, 'arcade');
    await page.screenshot({ path: join(SHOTS, `flat-${String(w)}x${String(h)}.png`) });
    expect(errors).toEqual([]);
  });
}
