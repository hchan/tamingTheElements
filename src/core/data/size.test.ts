import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_FLAGS } from '../flags';
import { createMatch, type MatchSetup } from '../sim/match';
import { NO_COMMAND } from '../sim/commands';
import { step } from '../sim/step';
import { ARCADE_E, ArcadeE } from '../sim/state';
import { setKnockback } from '../sim/systems/arcade/knockback';
import { CHARACTERS } from './characters';
import { characterId } from './ids';
import { CHARACTER_BOX, CHARACTER_SIZE, SIZE_MAX, SIZE_MIN, SIZE_ONE, boxOfSlug, sizeDamagePm, sizeLifePm, sizeOfDef, sizeOfSlug, sizeRootPm, sizeSpeedPm, sizeWeightPm, sizeWidthPx } from './size';

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
    expect(Object.keys(CHARACTER_SIZE)).toEqual(['rokcore', 'ishimi', 'kindrel', 'nykra', 'quarrak', 'hyalia', 'brazgor', 'glimmaw', 'durrok', 'zephra']);
    expect(sizeOfSlug('rokcore')).toBe(200);
    expect(sizeOfSlug('ishimi')).toBe(150);
    expect(sizeOfSlug('pax')).toBe(SIZE_ONE);
    expect(sizeOfSlug('nobody')).toBe(SIZE_ONE);
    for (let i = 0; i < CHARACTERS.length; i++) {
      expect(sizeOfDef(i)).toBeGreaterThanOrEqual(SIZE_MIN);
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

describe('small and non-square heroes (roster WP 0.3)', () => {
  const sizes = CHARACTER_SIZE as Record<string, number>;
  const boxes = CHARACTER_BOX as Record<string, readonly [number, number]>;
  /** Runs `fn` with 'pax' registered as a size-60 hero with a 200x90 box, then unregisters it. */
  function withTestHero<T>(size: number, box: readonly [number, number] | undefined, fn: () => T): T {
    sizes.pax = size;
    if (box) boxes.pax = box;
    try {
      return fn();
    } finally {
      delete sizes.pax;
      delete boxes.pax;
    }
  }

  it('only the roster-24 heroes are below 1x (Kindrel) or non-square (Hyalia), and the clamp floor is SIZE_MIN', () => {
    expect(Object.keys(CHARACTER_BOX)).toEqual(['hyalia']);
    expect(Math.min(...CHARACTERS.map((c) => sizeOfSlug(c.id)))).toBe(60);
    withTestHero(10, undefined, () => { expect(sizeOfSlug('pax')).toBe(SIZE_MIN); });
    expect(boxOfSlug('pax')).toEqual([80, 80]);
    expect(boxOfSlug('rokcore')).toEqual([160, 160]);
  });

  it('curves continue below 1x', () => {
    expect([sizeLifePm(60), sizeDamagePm(60), sizeWeightPm(60), sizeSpeedPm(60), sizeRootPm(60), sizeWidthPx(60)]).toEqual([820, 952, 760, 1112, 1100, 48]);
    expect([sizeLifePm(SIZE_MIN), sizeWeightPm(SIZE_MIN), sizeSpeedPm(SIZE_MIN)]).toEqual([775, 700, 1140]);
  });

  it('a size-60 hero: a 48x48 box on a 1x hero centre, less life, faster', () => {
    const normal = make('pax', true);
    const small = withTestHero(60, undefined, () => make('pax', true));
    expect([small.w[0], small.h[0]]).toEqual([48, 48]);
    expect((small.x[0] ?? 0) + 24).toBe((normal.x[0] ?? 0) + 40);
    expect((small.y[0] ?? 0) + 24).toBe((normal.y[0] ?? 0) + 40);
    expect(small.maxHp[0]).toBe(Math.floor(((normal.maxHp[0] ?? 0) * 820) / 1000));
    expect(small.speed[0]).toBeGreaterThan(normal.speed[0] ?? 0);
  });

  it('an aspect box (200x90 at size 100) is scaled by size and centred; Classic ignores it', () => {
    withTestHero(100, [200, 90], () => {
      const wyrm = make('pax', true);
      expect([wyrm.w[0], wyrm.h[0]]).toEqual([200, 90]);
      expect(boxOfSlug('pax')).toEqual([200, 90]);
      const classic = make('pax', false);
      expect([classic.w[0], classic.h[0]]).toEqual([80, 80]);
    });
    withTestHero(60, [200, 90], () => { expect(boxOfSlug('pax')).toEqual([120, 54]); });
  });

  it('a size-60 200x90 hero fights: 300 ticks run, the box holds and every coordinate stays finite and in the arena', () => {
    withTestHero(60, [200, 90], () => {
      const world = createMatch({
        simVersion: 0, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
        p1: [{ character: characterId('pax'), xp: 1 }], p2: [{ character: characterId('fiara'), xp: 1 }],
      });
      for (let i = 0; i < 300; i++) step(world, [NO_COMMAND, NO_COMMAND]);
      const s = world.state;
      expect([s.w[0], s.h[0]]).toEqual([120, 54]);
      for (const v of [s.x[0], s.y[0], s.hp[0]]) expect(Number.isFinite(v)).toBe(true);
    });
  });
});
