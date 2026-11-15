import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Wing flap and knee bend while walking (idea move-animation-wings-knees): a winged (Sindarosa) and a legged (Treenoc) hero
// walk in real time against a still dummy; a short run of frames shows the body moving, and $SHOT_DIR keeps the real
// screenshot sequence. Reduced motion keeps the walk row but no extra bob.
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /has no frame|missing frame/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function frames(page: Page, hero: string, tag: string): Promise<Buffer[]> {
  await page.goto(`/?ff=arenaDemo,arcade&seed=7&hero=${hero}&foe=dummy`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.waitForTimeout(1500); // round intro
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(250);
  const shots: Buffer[] = [];
  const box = await page.locator('#game canvas').boundingBox();
  const clip = box && { x: box.x + box.width * 0.25, y: box.y + box.height * 0.25, width: box.width * 0.5, height: box.height * 0.5 };
  for (let i = 0; i < 6; i++) {
    const shot = await page.screenshot(clip ? { clip } : {});
    shots.push(shot);
    if (process.env['SHOT_DIR']) await page.screenshot({ path: `${process.env['SHOT_DIR']}/${tag}-${String(i)}.png`, ...(clip && { clip }) });
    await page.waitForTimeout(60);
  }
  await page.keyboard.up('KeyD');
  return shots;
}

for (const [hero, kind] of [['sindarosa', 'wings'], ['treenoc', 'knees']] as const) {
  test(`${kind}: ${hero} walking animates frame to frame without errors`, async ({ page }) => {
    const errors = collectErrors(page);
    const shots = await frames(page, hero, `${kind}-${hero}`);
    expect(new Set(shots.map((b) => b.toString('base64'))).size).toBeGreaterThan(2);
    expect(errors).toEqual([]);
  });
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('a walking winged hero still renders without errors', async ({ page }) => {
    const errors = collectErrors(page);
    await frames(page, 'sindarosa', 'wings-reduced');
    expect(errors).toEqual([]);
  });
});
