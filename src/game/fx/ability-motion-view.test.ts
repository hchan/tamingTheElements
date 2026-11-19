import { describe, expect, it } from 'vitest';
import { SimEventKind, type SimEvent } from '@core/index';
import { MotionSmoother, TICK_MS } from './ability-motion-view';
import type { SmoothKind } from './ability-smooth';

const KINDS: Record<number, SmoothKind> = { 1: 'grab', 2: 'pull', 3: 'shock' };
const hit = (tick: number, target: number, ability: number, attacker = 0): SimEvent =>
  ({ tick, sourceId: attacker, kind: SimEventKind.hitConfirmed, seq: 0, target, attacker, ability, strength: 1, dir: 0 });
const stop = (tick: number, ticks: number): SimEvent => ({ tick, sourceId: 0, kind: SimEventKind.hitStop, seq: 1, ticks });

function make(reduced = false) {
  const pos = new Map<number, { x: number; y: number }>([[5, { x: 100, y: 50 }]]);
  const s = new MotionSmoother({ positionOf: (id) => pos.get(id), reduced: () => reduced, kindOf: (d) => KINDS[d] });
  return { s, pos };
}
const RAMP = 140 / TICK_MS;

describe('MotionSmoother', () => {
  it('starts at p0 - sim and ends at zero', () => {
    const { s, pos } = make();
    s.consume([hit(10, 5, 1)]);
    pos.set(5, { x: 130, y: 50 });
    s.advance(10);
    expect(s.shiftFor(5).dx).toBeCloseTo(100 - 130);
    s.advance(10 + RAMP);
    expect(s.shiftFor(5)).toEqual({ dx: 0, dy: 0 });
  });

  it('never passes sim and stays continuous', () => {
    const { s, pos } = make();
    s.consume([hit(0, 5, 2)]);
    let prevDrawn = 100;
    for (let t = 0; t <= RAMP + 2; t++) {
      const simX = 100 + 6 * t;
      pos.set(5, { x: simX, y: 50 });
      s.advance(t);
      const drawn = simX + s.shiftFor(5).dx;
      expect(drawn).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(drawn).toBeLessThanOrEqual(simX + 1e-9);
      if (t === 1) expect(drawn - prevDrawn).toBeLessThan(2); // eases in: no jump from standing
      if (t > 0) expect(drawn - prevDrawn).toBeLessThan(14); // catches up smoothly
      prevDrawn = drawn;
    }
    expect(s.shiftFor(5).dx).toBe(0);
  });

  it('starts the ramp after the hit-stop freeze', () => {
    const { s, pos } = make();
    s.consume([hit(10, 5, 1), stop(10, 4)]);
    pos.set(5, { x: 160, y: 50 });
    s.advance(13);
    expect(s.shiftFor(5).dx).toBeCloseTo(-60);
    s.advance(14 + RAMP);
    expect(s.shiftFor(5).dx).toBe(0);
  });

  it('ignores non-grab/pull kinds, unknown abilities and gone targets', () => {
    const { s, pos } = make();
    s.consume([hit(0, 5, 3), hit(0, 5, 99), hit(0, 77, 1)]);
    pos.set(5, { x: 200, y: 50 });
    expect(s.shiftFor(5)).toEqual({ dx: 0, dy: 0 });
    expect([...s.active()]).toHaveLength(0);
  });

  it('reduced motion gives no shift', () => {
    const { s, pos } = make(true);
    s.consume([hit(0, 5, 1)]);
    pos.set(5, { x: 200, y: 50 });
    expect(s.shiftFor(5)).toEqual({ dx: 0, dy: 0 });
  });

  it('reuses an entity id cleanly after expiry', () => {
    const { s, pos } = make();
    s.consume([hit(0, 5, 1)]);
    s.advance(RAMP + 1);
    expect([...s.active()]).toHaveLength(0);
    pos.set(5, { x: 400, y: 300 });
    s.consume([hit(40, 5, 2)]);
    pos.set(5, { x: 420, y: 300 });
    s.advance(40);
    expect(s.shiftFor(5).dx).toBeCloseTo(-20);
    s.clear();
    expect(s.shiftFor(5)).toEqual({ dx: 0, dy: 0 });
  });
});
