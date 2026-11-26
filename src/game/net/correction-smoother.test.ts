import { describe, expect, it } from 'vitest';
import { CorrectionSmoother } from './correction-smoother';
import { CORRECTION_DECAY, CORRECTION_MAX_PX } from './online-tuning';

const pos = (x: number) => ({ x, y: 0, px: x - 1, py: 0 });

describe('CorrectionSmoother', () => {
  it('draws a rollback jump as a continuous, decaying blend', () => {
    const s = new CorrectionSmoother();
    s.begin(0, 1); s.apply(1, pos(100));
    s.begin(1, 2); const c = pos(80); s.apply(1, c); // sim snapped back: old history would have drawn 101 (one normal step on), now 80
    expect(c.x).toBeCloseTo(80 + 21 * CORRECTION_DECAY, 5);
    let prev = c.x;
    for (let i = 0; i < 30; i++) { s.begin(1, 3 + i); const d = pos(80); s.apply(1, d); expect(d.x).toBeLessThanOrEqual(prev); prev = d.x; }
    expect(prev).toBe(80);
  });
  it('leaves normal motion and teleports alone', () => {
    const s = new CorrectionSmoother();
    s.begin(0, 1); s.apply(1, pos(100));
    s.begin(1, 2); const a = pos(101); s.apply(1, a); expect(a.x).toBe(101); // a rollback frame, but the fighter just took its normal step
    s.begin(2, 3); const b = pos(101 + CORRECTION_MAX_PX + 50); s.apply(1, b); expect(b.x).toBe(101 + CORRECTION_MAX_PX + 50);
  });
  it('does nothing without a rollback', () => {
    const s = new CorrectionSmoother();
    s.begin(0, 1); s.apply(1, pos(100));
    s.begin(0, 2); const c = pos(50); s.apply(1, c); expect(c.x).toBe(50);
  });
});
