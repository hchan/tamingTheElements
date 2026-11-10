import { describe, expect, it } from 'vitest';
import { ELEMENTS, SimEventKind, type SimEvent } from '@core/index';
import { BURST_FROM, BURST_R, ClashFx, burstAlpha, burstRadius, type ClashSink } from './clash-fx';
import { ELEMENT_COLORS } from './element-colors';

let seq = 0;
const el = (e: (typeof ELEMENTS)[number]): number => ELEMENTS.indexOf(e);
const clash = (tick: number, winner: 'a' | 'b' | 'none', ea = el('fire'), eb = el('air')): SimEvent =>
  ({ tick, sourceId: 2, kind: SimEventKind.clash, seq: seq++, a: 2, b: 3, winner: winner === 'a' ? 2 : winner === 'b' ? 3 : -1, x: 640, y: 300, ea, eb });

function fake(reduced = false) {
  const calls: { x: number; y: number; under: number; over: number; cancel: boolean; flat: boolean }[] = [];
  const sink: ClashSink = { burst: (x, y, under, over, cancel, flat) => calls.push({ x, y, under, over, cancel, flat }) };
  const prefs = { reduced };
  return { calls, prefs, fx: new ClashFx(sink, () => prefs.reduced) };
}

describe('clash burst rules (FUN-DESIGN section 3: two-colour ring, winner element on top)', () => {
  it('every clash gives exactly one burst at the overlap centre (feedback coverage 100%)', () => {
    const { calls, fx } = fake();
    const events = [clash(10, 'a'), clash(10, 'b'), clash(11, 'none')];
    fx.consume(events);
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.x === 640 && c.y === 300)).toBe(true);
  });

  it('the winner\'s element colour is on top; the loser\'s under it', () => {
    const { calls, fx } = fake();
    fx.consume([clash(10, 'a'), clash(11, 'b', el('fire'), el('water'))]);
    expect(calls[0]).toMatchObject({ over: ELEMENT_COLORS.fire, under: ELEMENT_COLORS.air, cancel: false });
    expect(calls[1]).toMatchObject({ over: ELEMENT_COLORS.water, under: ELEMENT_COLORS.fire, cancel: false });
  });

  it('a cancel shows both colours and the white core', () => {
    const { calls, fx } = fake();
    fx.consume([clash(10, 'none', el('void'), el('air'))]);
    expect(calls[0]).toMatchObject({ over: ELEMENT_COLORS.void, under: ELEMENT_COLORS.air, cancel: true });
  });

  it('re-delivered events (same or older tick and seq) are skipped; other kinds are ignored', () => {
    const { calls, fx } = fake();
    const e = clash(20, 'a');
    fx.consume([e]);
    fx.consume([e, clash(19, 'a')]);
    fx.consume([{ tick: 21, sourceId: 0, kind: SimEventKind.parried, seq: 0 }]);
    expect(calls).toHaveLength(1);
  });

  it('reduced motion: a static ring (no growth), still fading', () => {
    const { calls, prefs, fx } = fake();
    fx.consume([clash(10, 'a')]);
    prefs.reduced = true;
    fx.consume([clash(11, 'a')]);
    expect(calls.map((c) => c.flat)).toEqual([false, true]);
    expect([burstRadius(0, true), burstRadius(0.5, true), burstRadius(1, true)]).toEqual([BURST_R, BURST_R, BURST_R]);
    expect(burstRadius(0, false)).toBeCloseTo(BURST_R * BURST_FROM, 9);
    expect(burstRadius(1, false)).toBe(BURST_R);
    expect(burstRadius(0.5, false)).toBeGreaterThan(burstRadius(0.25, false));
    expect([burstAlpha(0), burstAlpha(0.5), burstAlpha(0.75), burstAlpha(1)]).toEqual([1, 1, 0.5, 0]);
  });
});
