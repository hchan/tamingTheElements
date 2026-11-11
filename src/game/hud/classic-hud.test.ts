import { describe, expect, it } from 'vitest';
import { criticalPulse, regenLabel, regenPerSec, regenState, restCapPct, shade } from './bars';
import { fitIcon } from './action-bar';
import { meleeLook } from '../views/projectile-view';

const c = (o: Partial<{ dead: boolean; benched: boolean; hp: number; restCap: number; maxHp: number }> = {}) =>
  ({ dead: false, benched: true, hp: 40, restCap: 80, maxHp: 100, ...o });

describe('regen cues', () => {
  it('heals on the bench below the cap, rests at the cap, and does not regen in play or when knocked out', () => {
    expect(regenState(c())).toBe('healing');
    expect(regenState(c({ hp: 80 }))).toBe('capped');
    expect(regenState(c({ benched: false }))).toBe('inPlay');
    expect(regenState(c({ dead: true }))).toBe('none');
  });
  it('labels the rate (0.5% of max health per second) while healing', () => {
    expect(regenPerSec(1000)).toBe(5);
    expect(regenLabel(c({ maxHp: 200 }))).toBe('+1/s');
    expect(regenLabel(c({ hp: 80 }))).toBe('rested');
    expect(regenLabel(c({ benched: false }))).toBe('');
  });
  it('reports the rest cap percent', () => {
    expect(restCapPct({ restCap: 51.2, maxHp: 100 })).toBe(51);
  });
});

describe('bar chrome helpers', () => {
  it('shade scales channels and clamps', () => {
    expect(shade(0x808080, 0.5)).toBe(0x404040);
    expect(shade(0xf0f0f0, 2)).toBe(0xffffff);
  });
  it('criticalPulse is steady with reduced motion and stays within 0.45..1', () => {
    expect(criticalPulse(123, true)).toBe(1);
    for (let t = 0; t < 700; t += 50) expect(criticalPulse(t, false)).toBeGreaterThanOrEqual(0.45);
    expect(criticalPulse(350, false)).toBeCloseTo(1);
  });
});

describe('fitIcon', () => {
  it('keeps the aspect and centres, so wide and square frames fill the slot side', () => {
    expect(fitIcon(80, 32, 60)).toEqual({ w: 60, h: 24, dx: 0, dy: 18 });
    expect(fitIcon(80, 80, 60)).toEqual({ w: 60, h: 60, dx: 0, dy: 0 });
  });
});

describe('meleeLook', () => {
  it('stays flat east, mirrors west, and turns tall north/south boxes', () => {
    expect(meleeLook(0, 240, 40)).toEqual({ angle: 0, w: 240, h: 40, flip: false });
    expect(meleeLook(4, 240, 40).flip).toBe(true);
    expect(meleeLook(2, 40, 240)).toEqual({ angle: 270, w: 240, h: 40, flip: false });
    expect(meleeLook(6, 40, 240).angle).toBe(90);
  });
});
