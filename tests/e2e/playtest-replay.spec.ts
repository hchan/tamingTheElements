import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { characters, collectErrors, newGameToGarrison, startBattle, waitForRoute } from './parity/helpers';

const START = '/?manual=1&seed=7&ff=record';

/**
 * A scripted "human": real key presses (held movement keys plus primary attack) chosen from what is on
 * screen, while the test fast-forwards the sim with the keyboard agent deciding every command.
 */
async function playWithKeys(page: Page): Promise<void> {
  const held = new Set<string>();
  const set = async (keys: string[]): Promise<void> => {
    for (const k of [...held]) {
      if (!keys.includes(k)) {
        await page.keyboard.up(k);
        held.delete(k);
      }
    }
    for (const k of keys) {
      if (!held.has(k)) {
        await page.keyboard.down(k);
        held.add(k);
      }
    }
  };
  for (let round = 0; round < 400; round++) {
    if ((await page.evaluate<string>(`window.__TTE__.state().route`)) !== '#loading') break;
    const cs = await characters(page);
    const me = cs.find((c) => c.team === 0) as (typeof cs)[number] & { x: number; y: number } | undefined;
    const foe = cs.find((c) => c.team === 1) as typeof me;
    if (!me || !foe) {
      await page.evaluate(`window.__TTE__.arena.stepLive(5)`);
      continue;
    }
    const keys = ['Space'];
    if (Math.abs(foe.x - me.x) > 20) keys.push(foe.x > me.x ? 'ArrowRight' : 'ArrowLeft');
    if (Math.abs(foe.y - me.y) > 20) keys.push(foe.y > me.y ? 'ArrowDown' : 'ArrowUp');
    await set(keys);
    await page.evaluate(`window.__TTE__.arena.stepLive(10)`);
  }
  await set([]);
}

test('a recorded scripted playtest downloads and verifies in the replay viewer', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto(START);
  await newGameToGarrison(page);
  await startBattle(page, 'enterPracticeContainer');

  await playWithKeys(page);
  await waitForRoute(page, '#victory');
  await page.evaluate(`window.__TTE__.settled()`);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#downloadReplay').click()]);
  const file = testInfo.outputPath('playtest.replay.json');
  await download.saveAs(file);
  const replay = JSON.parse(readFileSync(file, 'utf8')) as { header: { tickCount: number; seed: number }; hashes: number[] };
  expect(replay.header.seed).toBe(7);
  expect(replay.header.tickCount).toBeGreaterThan(50);

  // The last N replays are also kept in IndexedDB.
  const stored = await page.evaluate<number>(`new Promise((resolve, reject) => {
    const r = indexedDB.open('tte-replays');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const q = r.result.transaction('replays').objectStore('replays').count();
      q.onsuccess = () => resolve(q.result);
    };
  })`);
  expect(stored).toBe(1);

  // Load it in the viewer: it plays back the recorded commands and every checkpoint hash matches.
  await page.goto('/#replay');
  await page.locator('#replayFile').setInputFiles(file);
  await page.waitForFunction(`window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`);
  await page.locator('#replay2x').click();
  await expect(page.locator('#replayStatus')).toContainText('OK', { timeout: 120_000 });
  expect(await page.evaluate<number>(`window.__TTE__.state().tick`)).toBe(replay.header.tickCount);

  await page.evaluate(`window.location.hash = '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});

test('the viewer reports the first divergent tick for a tampered replay', async ({ page }) => {
  const golden = JSON.parse(readFileSync(new URL('../fixtures/replays/random-vs-random.replay.json', import.meta.url), 'utf8')) as {
    hashes: number[];
  };
  golden.hashes[2] = (golden.hashes[2] as number) ^ 1;
  await page.goto('/#replay');
  await page.locator('#replayFile').setInputFiles({
    name: 'bad.replay.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(golden)),
  });
  await expect(page.locator('#replayStatus')).toContainText('DIVERGED at tick 100', { timeout: 60_000 });
});

test('nothing is recorded or stored without the flag or setting', async ({ page }) => {
  await page.goto('/?manual=1&seed=7');
  await newGameToGarrison(page);
  await startBattle(page, 'enterPracticeContainer');
  await page.evaluate(`window.__TTE__.arena.step(5)`);
  await page.evaluate(`window.location.hash = '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  const dbs = await page.evaluate<string[]>(`indexedDB.databases().then((d) => d.map((x) => x.name))`);
  expect(dbs).not.toContain('tte-replays');
  expect(await page.evaluate<string | null>(`window.localStorage.getItem('tte.recordPlaytests')`)).toBeNull();
});
