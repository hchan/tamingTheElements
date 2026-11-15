import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { createStreakLayer } from './hit-streak-view';
import { STREAKS_BY_STRENGTH } from './hit-feel';

type Listener = (time: number, delta: number) => void;
interface Line {
  w: number;
  a: number;
  len: number;
}

function fakeScene(): { scene: Phaser.Scene; lines: Line[]; update: (ms: number) => void } {
  const lines: Line[] = [];
  let style = { w: 0, a: 0 };
  const listeners: Listener[] = [];
  const gfx = {
    setDepth: () => gfx,
    setBlendMode: () => gfx,
    clear: () => {
      lines.length = 0;
      return gfx;
    },
    fillStyle: () => gfx,
    fillCircle: () => gfx,
    lineStyle: (w: number, _c: number, a: number) => {
      style = { w, a };
      return gfx;
    },
    lineBetween: (x1: number, y1: number, x2: number, y2: number) => {
      lines.push({ ...style, len: Math.hypot(x2 - x1, y2 - y1) });
      return gfx;
    },
  };
  const scene = {
    add: { graphics: () => gfx },
    events: {
      on: (_e: string, f: Listener) => {
        listeners.push(f);
      },
      off: () => undefined,
      once: () => undefined,
    },
  } as unknown as Phaser.Scene;
  return {
    scene,
    lines,
    update: (ms) => {
      for (const f of listeners) f(0, ms);
    },
  };
}

describe('hit streak layer visibility', () => {
  it('draws visible lines on the first frame even while paused (manual stepping, held frames)', () => {
    const { scene, lines, update } = fakeScene();
    createStreakLayer(scene, () => true).spawn(100, 100, 1, 0x66aaff, 1);
    update(16);
    expect(lines.length).toBe(STREAKS_BY_STRENGTH[1] * 2); // body + core per streak
    for (const l of lines) {
      expect(l.len).toBeGreaterThan(8);
      expect(l.w).toBeGreaterThanOrEqual(1.5);
      expect(l.a).toBeGreaterThan(0.3);
    }
  });

  it('plays out in real time and then stops drawing', () => {
    const { scene, lines, update } = fakeScene();
    createStreakLayer(scene, () => false).spawn(0, 0, -1, 0xff8844, 3);
    update(40);
    expect(lines.length).toBe(STREAKS_BY_STRENGTH[3] * 2);
    update(1000);
    expect(lines.length).toBe(0);
  });
});
