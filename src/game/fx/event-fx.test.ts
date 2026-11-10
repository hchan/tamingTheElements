import { describe, expect, it } from 'vitest';
import { SimEventKind, type SimEvent } from '@core/index';
import { CosmeticRng, EventDeduper, EventFx, HIT_PARTICLES, type FxSink } from './event-fx';
import { rotationForDir } from '../views/projectile-view';

const dmg = (tick: number, seq: number, target = 3): SimEvent =>
  ({ tick, sourceId: 9, kind: SimEventKind.damage, seq, target, attacker: 1, amount: 5 });

function recorder(): { sink: FxSink; log: string[] } {
  const log: string[] = [];
  return {
    log,
    sink: {
      flash: (t) => log.push(`flash${String(t)}`),
      burst: (t, o) => log.push(`burst${String(t)}x${String(o.length)}`),
      shake: () => log.push('shake'),
    },
  };
}

describe('EventDeduper', () => {
  it('accepts an id once and distinguishes seq, tick, kind and source', () => {
    const d = new EventDeduper();
    expect(d.firstSeen(dmg(1, 0))).toBe(true);
    expect(d.firstSeen(dmg(1, 0))).toBe(false);
    expect(d.firstSeen(dmg(1, 1))).toBe(true);
    expect(d.firstSeen(dmg(2, 0))).toBe(true);
    expect(d.firstSeen({ ...dmg(1, 0), kind: SimEventKind.died })).toBe(true);
    expect(d.firstSeen({ ...dmg(1, 0), sourceId: 10 })).toBe(true);
  });
  it('stays bounded and evicts the oldest first', () => {
    const d = new EventDeduper(3);
    for (let i = 0; i < 5; i++) d.firstSeen(dmg(i, 0));
    expect(d.size).toBe(3);
    expect(d.firstSeen(dmg(4, 0))).toBe(false);
    expect(d.firstSeen(dmg(0, 0))).toBe(true);
  });
});

describe('EventFx', () => {
  it('fires once per event id even when delivered twice', () => {
    const { sink, log } = recorder();
    const fx = new EventFx(sink, { reducedMotion: () => false });
    fx.consume([dmg(1, 0)]);
    fx.consume([dmg(1, 0), dmg(2, 0)]);
    expect(log.filter((l) => l === 'flash3')).toHaveLength(2);
    expect(log).toContain(`burst3x${String(HIT_PARTICLES)}`);
  });
  it('ignores non-damage events', () => {
    const { sink, log } = recorder();
    new EventFx(sink, { reducedMotion: () => false }).consume([{ ...dmg(1, 0), kind: SimEventKind.moved }]);
    expect(log).toEqual([]);
  });
  it('reduced motion keeps the flash but drops particles and shake', () => {
    const { sink, log } = recorder();
    new EventFx(sink, { reducedMotion: () => true }).consume([dmg(1, 0)]);
    expect(log).toEqual(['flash3']);
  });
});

describe('cosmetic helpers', () => {
  it('CosmeticRng is deterministic and in [0, 1)', () => {
    const a = new CosmeticRng(7);
    const b = new CosmeticRng(7);
    for (let i = 0; i < 20; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('rotates bullets by dir except Tornado', () => {
    expect([0, 2, 4, 6, 7].map((d) => rotationForDir(d, 'fireball'))).toEqual([0, 90, 180, 270, 315]);
    expect(rotationForDir(2, 'tornado')).toBe(0);
  });
});
