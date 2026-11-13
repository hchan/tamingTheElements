import { describe, expect, it } from 'vitest';
import { SimEventKind, type SimEvent } from '@core/index';
import { EventFx, type FxSink } from './event-fx';
import { IMPACT_MS, impactFrameAt } from './impact-view';
import { LOOP_FPS, loopFrameAt, lookup } from '../views/projectile-view';

describe('impactFrameAt', () => {
  it('walks the frames once then ends', () => {
    expect(impactFrameAt(0, 12)).toBe(0);
    expect(impactFrameAt(IMPACT_MS / 2, 12)).toBe(6);
    expect(impactFrameAt(IMPACT_MS - 1, 12)).toBe(11);
    expect(impactFrameAt(IMPACT_MS, 12)).toBe(-1);
    expect(impactFrameAt(-1, 12)).toBe(-1);
  });
  it('has an impact sheet for every element', () => {
    for (const e of ['Fire', 'Air', 'Earth', 'Water', 'Void']) expect(lookup(`impact${e}`)).toBeDefined();
  });
});

describe('looping projectile strips', () => {
  it('cycles frames at LOOP_FPS and wraps', () => {
    expect(loopFrameAt(0, 8)).toBe(0);
    expect(loopFrameAt(1000 / LOOP_FPS + 1, 8)).toBe(1);
    expect(loopFrameAt((1000 * 8) / LOOP_FPS + 1, 8)).toBe(0);
    expect(loopFrameAt(500, 0)).toBe(0);
  });
  it('has a loop strip for the looping sprites', () => {
    for (const k of ['fireball', 'hurlRock', 'icicles', 'chaosOrb', 'windCone']) expect(lookup(`${k}Loop`)).toBeDefined();
  });
});

describe('EventFx impact hook', () => {
  const dmg = (attacker: number): SimEvent => ({ tick: 1, sourceId: 0, kind: SimEventKind.damage, seq: 1, target: 3, attacker, amount: 5 });
  const sinkWith = (log: string[]): FxSink => ({
    flash: () => undefined,
    burst: () => undefined,
    spark: () => undefined,
    shake: () => undefined,
    jitter: () => undefined,
    number: () => undefined,
    superCut: () => undefined,
    impact: (t, el) => log.push(`impact${String(t)}:${el}`),
  });
  it('plays the attacker element impact on a hit, but not under reduced motion', () => {
    const a: string[] = [];
    new EventFx(sinkWith(a), { reducedMotion: () => false, elementOf: (id) => (id === 1 ? 'water' : undefined) }).consume([dmg(1)]);
    expect(a).toEqual(['impact3:water']);
    const b: string[] = [];
    new EventFx(sinkWith(b), { reducedMotion: () => true, elementOf: () => 'water' }).consume([dmg(1)]);
    expect(b).toEqual([]);
  });
  it('skips the impact when the attacker has no element', () => {
    const a: string[] = [];
    new EventFx(sinkWith(a), { reducedMotion: () => false }).consume([dmg(1)]);
    expect(a).toEqual([]);
  });
});
