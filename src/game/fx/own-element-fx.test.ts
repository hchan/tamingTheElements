import { describe, expect, it } from 'vitest';
import { HEAL_PULSE_TICKS, PART_MAX, Shape, fillParts, healTick, ownElementKind, parts, pulseLook } from './own-element-fx';

// One patch rect (x, y, w, h) = (100, 100, 200, 100).
const patches = [100, 100, 200, 100];
const box = { x: 160, y: 120, w: 40, h: 60 };

describe('ownElementKind', () => {
  it('is the stage when the element matches and the centre is in a patch', () => {
    expect(ownElementKind(1, 'fire', patches, 1, 200, 150)).toBe(1);
    expect(ownElementKind(2, 'water', patches, 1, 200, 150)).toBe(2);
    expect(ownElementKind(3, 'earth', patches, 1, 200, 150)).toBe(3);
    expect(ownElementKind(4, 'air', patches, 1, 200, 150)).toBe(4);
  });
  it('is 0 for another element, outside a patch, no stage or the void', () => {
    expect(ownElementKind(1, 'water', patches, 1, 200, 150)).toBe(0);
    expect(ownElementKind(1, 'fire', patches, 1, 50, 150)).toBe(0);
    expect(ownElementKind(0, 'fire', patches, 1, 200, 150)).toBe(0);
    expect(ownElementKind(1, 'void', patches, 1, 200, 150)).toBe(0);
    expect(ownElementKind(1, 'fire', patches, 0, 200, 150)).toBe(0);
  });
});

describe('healTick and pulseLook', () => {
  it('only a water hero whose HP rose heals', () => {
    expect(healTick(2, 50, 60)).toBe(true);
    expect(healTick(2, 60, 60)).toBe(false);
    expect(healTick(2, 60, 50)).toBe(false);
    expect(healTick(1, 50, 60)).toBe(false);
  });
  it('the pulse lives HEAL_PULSE_TICKS, fades out and is absent in reduced motion', () => {
    expect(pulseLook(0, false)?.alpha).toBe(1);
    const late = pulseLook(HEAL_PULSE_TICKS - 1, false);
    expect(late?.alpha).toBeLessThan(0.2);
    expect(pulseLook(HEAL_PULSE_TICKS, false)).toBeUndefined();
    expect(pulseLook(-1, false)).toBeUndefined();
    expect(pulseLook(3, true)).toBeUndefined();
  });
});

describe('fillParts', () => {
  it('fills a non-empty pool for each element, within the pool size, with finite numbers', () => {
    for (const kind of [1, 2, 3, 4]) {
      for (const age of [0, 1, 37, 5000]) {
        const n = fillParts(kind, box, age, false, 3);
        expect(n).toBeGreaterThanOrEqual(5);
        expect(n).toBeLessThanOrEqual(PART_MAX);
        for (let i = 0; i < n; i++) {
          const p = parts[i];
          expect(Number.isFinite((p?.x ?? NaN) + (p?.y ?? NaN) + (p?.s ?? NaN) + (p?.rot ?? NaN))).toBe(true);
          expect(p?.a).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
  it('is deterministic and animates over time', () => {
    const snap = (age: number): string => {
      const n = fillParts(1, box, age, false, 5);
      return JSON.stringify(parts.slice(0, n));
    };
    expect(snap(10)).toBe(snap(10));
    expect(snap(10)).not.toBe(snap(30));
  });
  it('reduced motion is static (same at any age), adds a steady glow, differs from the animated pose', () => {
    for (const kind of [1, 2, 3, 4]) {
      const a = fillParts(kind, box, 3, true, 9);
      const first = JSON.stringify(parts.slice(0, a));
      expect(parts[0]?.shape).toBe(Shape.glow);
      const b = fillParts(kind, box, 900, true, 9);
      expect(b).toBe(a);
      expect(JSON.stringify(parts.slice(0, b))).toBe(first);
    }
  });
  it('different heroes (salt) scatter differently', () => {
    const snap = (salt: number): string => JSON.stringify(parts.slice(0, fillParts(2, box, 20, false, salt)));
    expect(snap(1)).not.toBe(snap(2));
  });
});
