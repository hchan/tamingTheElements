import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Smooth movement through clock holds (smooth-wp2): hit-stop and the super freeze skip movement in the sim, so px/py go
// stale; the view must not replay the last step every render frame. `sweepDrawn` renders 4 frames per tick at alpha
// 0, .25, .5, .75 through the real draw path and returns the drawn x of a fighter. Page code is passed as strings.
const RIGHT = 8;
const CHARGE = 1 << 15;
const SUPER = 1 << 13;
const INTRO = 91;
const FRAMES = 4;

interface Sample { x: number; frozen: boolean }

async function open(page: Page, me: number, foe: number): Promise<number> {
  await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  return page.evaluate<number>(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(INTRO)});
    const [m, f] = a.characters();
    a.place(m.id, ${String(me)}, 380, 0);
    a.place(f.id, ${String(foe)}, 380, 4);
    a.setMeter(1, 1000);
    return m.id;
  })()`);
}

const sweep = (page: Page, id: number, n: number, cmds: [number, number]): Promise<Sample[]> =>
  page.evaluate<Sample[]>(`window.__TTE__.arena.sweepDrawn(${String(id)}, ${String(n)}, [${String(cmds[0])}, ${String(cmds[1])}], ${String(FRAMES)})`);

/** The drawn x never goes back (a replayed step would jump back every wrap of alpha). */
function expectMonotonic(s: Sample[]): void {
  for (let i = 1; i < s.length; i++) {
    const prev = s[i - 1];
    const cur = s[i];
    if (!prev || !cur) throw new Error('sample');
    expect(cur.x, `frame ${String(i)}`).toBeGreaterThanOrEqual(prev.x - 1e-6);
  }
}

function heldRun(s: Sample[]): number {
  let longest = 0;
  let run = 0;
  for (const f of s) {
    run = f.frozen ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

test('a fighter running through a super freeze is drawn monotonic and still while it holds', async ({ page }) => {
  const id = await open(page, 300, 1100);
  await sweep(page, id, 10, [RIGHT, 0]);
  const s = await sweep(page, id, 60, [RIGHT, SUPER]);
  expect(heldRun(s)).toBeGreaterThan(10 * FRAMES);
  expectMonotonic(s);
  // Inside the freeze the drawn x does not move at all (no replay of the last step).
  const held = s.filter((f) => f.frozen).slice(FRAMES * 2).map((f) => f.x);
  expect(held.length).toBeGreaterThan(20);
  expect(Math.max(...held) - Math.min(...held)).toBeLessThan(1e-6);
});

test('a fighter charging into a hit is drawn monotonic through the hit-stop', async ({ page }) => {
  const id = await open(page, 700, 780);
  const s = await sweep(page, id, 40, [CHARGE, 0]);
  expect(heldRun(s)).toBeGreaterThan(FRAMES);
  expectMonotonic(s);
  const held = s.filter((f) => f.frozen).slice(FRAMES).map((f) => f.x);
  expect(Math.max(...held) - Math.min(...held)).toBeLessThan(1e-6);
});
