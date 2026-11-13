import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_FLAGS } from '../flags';
import { createMatch, type MatchSetup } from '../sim/match';
import { ARCADE_E, ArcadeE } from '../sim/state';
import { setKnockback } from '../sim/systems/arcade/knockback';
import { CHARACTERS } from './characters';
import { characterId } from './ids';
import { CHARACTER_SIZE, SIZE_MAX, SIZE_ONE, sizeDamagePm, sizeLifePm, sizeOfDef, sizeOfSlug, sizeRootPm, sizeSpeedPm, sizeWeightPm, sizeWidthPx } from './size';

function make(p1: string, arcade: boolean) {
  const setup: MatchSetup = {
    simVersion: 0, seed: 3, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }], p2: [{ character: characterId('pax'), xp: 1 }],
  };
  return createMatch(setup).state;
}

const rokSpeed = CHARACTERS.find((c) => c.id === 'rokcore')?.speed ?? 0;

describe('giant heroes size curves', () => {
  it('1x is the identity and 2x / 4x follow the linear curves', () => {
    expect([sizeLifePm(100), sizeDamagePm(100), sizeWeightPm(100), sizeSpeedPm(100), sizeWidthPx(100)]).toEqual([1000, 1000, 1000, 1000, 80]);
    expect([sizeLifePm(200), sizeDamagePm(200), sizeWeightPm(200), sizeSpeedPm(200), sizeWidthPx(200)]).toEqual([1450, 1120, 1600, 720, 160]);
    expect([sizeLifePm(400), sizeWeightPm(400), sizeSpeedPm(400)]).toEqual([2350, 2800, 300]);
  });

  it('Rokcore is 2x, Ishimi is 1.5x, and sizes stay in 100..SIZE_MAX', () => {
    expect(Object.keys(CHARACTER_SIZE)).toEqual(['rokcore', 'ishimi']);
    expect(sizeOfSlug('rokcore')).toBe(200);
    expect(sizeOfSlug('ishimi')).toBe(150);
    expect(sizeOfSlug('pax')).toBe(SIZE_ONE);
    expect(sizeOfSlug('nobody')).toBe(SIZE_ONE);
    for (let i = 0; i < CHARACTERS.length; i++) {
      expect(sizeOfDef(i)).toBeGreaterThanOrEqual(SIZE_ONE);
      expect(sizeOfDef(i)).toBeLessThanOrEqual(SIZE_MAX);
    }
  });
});

describe('3x and Snag scaling', () => {
  it('3x curves and the root length', () => {
    expect([sizeLifePm(300), sizeDamagePm(300), sizeWeightPm(300), sizeSpeedPm(300), sizeWidthPx(300)]).toEqual([1900, 1240, 2200, 440, 240]);
    expect([sizeRootPm(100), sizeRootPm(200), sizeRootPm(300), sizeRootPm(400)]).toEqual([1000, 750, 500, 400]);
  });
});

describe('giant heroes in a match', () => {
  it('Arcade Rokcore: a 160 box centred where a 1x hero stands, slower', () => {
    const giant = make('rokcore', true);
    const normal = make('pax', true);
    expect([giant.w[0], giant.h[0]]).toEqual([160, 160]);
    expect([normal.w[0], normal.h[0]]).toEqual([80, 80]);
    expect((giant.x[0] ?? 0) + 80).toBe((normal.x[0] ?? 0) + 40);
    expect((giant.y[0] ?? 0) + 80).toBe((normal.y[0] ?? 0) + 40);
    expect(giant.px[0]).toBe(giant.x[0]);
    expect(giant.speed[0]).toBeLessThan(rokSpeed);
    expect(giant.baseSpeed[0]).toBe(giant.speed[0]);
  });

  it('Classic ignores size', () => {
    const s = make('rokcore', false);
    expect([s.w[0], s.h[0]]).toEqual([80, 80]);
    expect(s.speed[0]).toBe(rokSpeed);
  });

  it('a hit shoves a giant by 1 / 1.6 of the knockback a 1x hero gets', () => {
    const giant = make('rokcore', true);
    const normal = make('pax', true);
    setKnockback(giant, 0, 160, 2);
    setKnockback(normal, 0, 160, 2);
    const n = Math.abs(normal.arcade[0 * ARCADE_E + ArcadeE.kbVx] ?? 0) + Math.abs(normal.arcade[0 * ARCADE_E + ArcadeE.kbVy] ?? 0);
    const g = Math.abs(giant.arcade[0 * ARCADE_E + ArcadeE.kbVx] ?? 0) + Math.abs(giant.arcade[0 * ARCADE_E + ArcadeE.kbVy] ?? 0);
    expect(n).toBe(160);
    expect(g).toBe(100);
  });
});
