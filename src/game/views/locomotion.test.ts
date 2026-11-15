import { describe, expect, it } from 'vitest';
import {
  FLAP_LIFT_PX, FLAP_MS, KNEE_DIP_PX, STEP_PX, WALK_FRAMES, applyBackGait, applyLocomotion, backGaitOf, backingAway, facesToward, flapPhase,
  kneeBend, locomotionOf, walkFrameBack, walkTimeBack,
} from './locomotion';
import { ACTIONS } from '../assets/sheet-spec';
import { frameIndex } from '../assets/sheet-frames';
import { resetPose, type Pose } from './pose-math';

const fresh = (): Pose => resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
const WINGS = { wings: true, legs: false };
const LEGS = { wings: false, legs: true };

describe('locomotion flags', () => {
  it('flags the winged and legged heroes and nothing else', () => {
    expect(locomotionOf('sindarosa')).toEqual(WINGS);
    expect(locomotionOf('pax').legs).toBe(true);
    expect(locomotionOf('treenoc').legs).toBe(true);
    expect(locomotionOf('echo')).toEqual({ wings: false, legs: false });
    expect(locomotionOf('nope')).toEqual({ wings: false, legs: false });
  });
});

describe('wing flap', () => {
  it('beats with the period FLAP_MS between 0 and 1', () => {
    expect(flapPhase(0)).toBe(0);
    expect(flapPhase(FLAP_MS / 2)).toBe(1);
    expect(flapPhase(FLAP_MS)).toBeCloseTo(0, 9);
  });
  it('lifts at the top of the stroke and moves with the walk amount', () => {
    const p = fresh();
    applyLocomotion(p, WINGS, 1, 0, FLAP_MS / 2, false);
    expect(p.oy).toBeCloseTo(-FLAP_LIFT_PX, 9);
    expect(p.sx).toBeGreaterThan(1);
    const q = fresh();
    applyLocomotion(q, WINGS, 0.5, 0, FLAP_MS / 2, false);
    expect(q.oy).toBeCloseTo(-FLAP_LIFT_PX / 2, 9);
  });
  it('actually changes over time while moving', () => {
    const ys = new Set<number>();
    for (let ms = 0; ms < FLAP_MS; ms += 30) { const p = fresh(); applyLocomotion(p, WINGS, 1, 0, ms, false); ys.add(Math.round(p.oy * 100)); }
    expect(ys.size).toBeGreaterThan(3);
  });
});

describe('knee bend', () => {
  it('is deepest at foot contact and straight mid-step, repeating every step', () => {
    expect(kneeBend(0)).toBe(1);
    expect(kneeBend(STEP_PX / 2)).toBe(0);
    expect(kneeBend(STEP_PX)).toBeCloseTo(1, 9);
  });
  it('dips and squashes at contact, and stands tall mid-step', () => {
    const p = fresh();
    applyLocomotion(p, LEGS, 1, 0, 0, false);
    expect(p.oy).toBeCloseTo(KNEE_DIP_PX, 9);
    expect(p.sy).toBeLessThan(1);
    const q = fresh();
    applyLocomotion(q, LEGS, 1, STEP_PX / 2, 0, false);
    expect(q.oy).toBeCloseTo(0, 9);
    expect(q.sy).toBeCloseTo(1, 9);
  });
});

describe('steady states', () => {
  it('adds nothing under reduced motion or when standing', () => {
    for (const flags of [WINGS, LEGS, { wings: true, legs: true }]) {
      for (const [move, reduced] of [[1, true], [0, false]] as const) {
        const p = fresh();
        applyLocomotion(p, flags, move, 13, 77, reduced);
        expect(p).toEqual(fresh());
      }
    }
  });
  it('leaves an unflagged hero alone', () => {
    const p = fresh();
    applyLocomotion(p, locomotionOf('echo'), 1, 13, 77, false);
    expect(p).toEqual(fresh());
  });
});

/** The sim rule's direction test (core `backwardWalkX`): a step against the foe's side is the slowed backward walk. */
const simBacksAway = (x: number, foeX: number, step: number): boolean => foeX !== x && step !== 0 && (step > 0) !== (foeX > x);

describe('backingAway mirrors the sim backwardWalkX rule', () => {
  it('agrees with the sim rule over a grid, apart from the crossing cases', () => {
    for (const px of [100, 300]) {
      for (const foe of [0, 200, 600]) {
        for (const step of [-3, -1.5, 1.5, 3]) {
          if (Math.abs(foe - px) <= Math.abs(step)) continue;
          expect(backingAway(px + step, px, foe)).toBe(simBacksAway(px, foe, step));
        }
      }
    }
  });
  it('is false for no step and for a foe at the same x', () => {
    expect(backingAway(100, 100, 500)).toBe(false);
    expect(backingAway(103, 100, 100)).toBe(false);
  });
  it('east foe: stepping west backs away, stepping east does not', () => {
    expect(backingAway(98, 100, 500)).toBe(true);
    expect(backingAway(102, 100, 500)).toBe(false);
  });
});

describe('facesToward', () => {
  it('east-ish facings point at an east foe, west-ish at a west foe, vertical never', () => {
    for (const f of [0, 1, 7]) { expect(facesToward(f, 100, 500)).toBe(true); expect(facesToward(f, 100, 0)).toBe(false); }
    for (const f of [3, 4, 5]) { expect(facesToward(f, 100, 0)).toBe(true); expect(facesToward(f, 100, 500)).toBe(false); }
    for (const f of [2, 6]) { expect(facesToward(f, 100, 500)).toBe(false); expect(facesToward(f, 100, 0)).toBe(false); }
  });
});

describe('reversed walk cycle', () => {
  it('walkTimeBack plays the baked walk row backwards (and pins WALK_FRAMES to the sheet spec)', () => {
    const s = 24;
    const seen: number[] = [];
    for (let k = 0; k < 8; k++) seen.push(frameIndex('walk', walkTimeBack(k * s, s)));
    expect(seen).toEqual([3, 2, 1, 0, 3, 2, 1, 0]);
    expect(WALK_FRAMES).toBe(ACTIONS.find(([a]) => a === 'walk')?.[1]);
  });
  it('walkFrameBack reverses a legacy strip of any length', () => {
    expect([0, 1, 2, 3].map((k) => walkFrameBack(k * 30, 4, 30))).toEqual([3, 2, 1, 0]);
    expect([0, 1].map((k) => walkFrameBack(k * 30, 2, 30))).toEqual([1, 0]);
  });
});

describe('backward gait per hero', () => {
  const STYLES: Record<string, string> = {
    pax: 'brace', treenoc: 'brace', lavax: 'brace', rokcore: 'brace', sindarosa: 'backflap', curomo: 'backflap',
    morblass: 'drift', ishimi: 'drift', echo: 'drift', cyclonius: 'drift', fiara: 'drift', wispera: 'arc',
    eternalVoid: 'recede', dummyTarget: 'none', nope: 'none',
  };
  const sweep = (name: string, side: number, f: (p: Pose) => void): void => {
    for (let phase = 0; phase <= 120; phase += 4) {
      for (let ms = 0; ms <= 1000; ms += 50) {
        const p = fresh();
        applyBackGait(p, backGaitOf(name), 1, side, phase, ms, false);
        f(p);
      }
    }
  };
  for (const [name, style] of Object.entries(STYLES)) {
    it(`${name}: ${style}`, () => {
      const g = backGaitOf(name);
      expect(g.style).toBe(style);
      if (style === 'none') {
        sweep(name, 1, (p) => { expect(p).toEqual(fresh()); });
        return;
      }
      let changed = false;
      let sum = 0;
      let n = 0;
      let maxLift = 0;
      sweep(name, 1, (p) => {
        expect(p.sx).toBe(1);
        expect(p.sy).toBe(1);
        changed ||= p.rot !== 0 || p.oy !== 0 || p.alpha !== 1;
        sum += p.rot;
        n++;
        maxLift = Math.max(maxLift, -p.oy);
      });
      expect(changed).toBe(true);
      if (style === 'brace' || style === 'backflap') expect(sum / n).toBeLessThan(0);
      if (style === 'drift' || style === 'recede') expect(sum / n).toBeGreaterThan(0);
      if (style === 'arc') expect(maxLift).toBeCloseTo(g.liftPx, 1);
      let mirrored = 0;
      sweep(name, -1, (p) => { mirrored += p.rot; });
      if (style !== 'arc') expect(Math.sign(mirrored)).toBe(-Math.sign(sum));
      for (const [amount, reduced] of [[0, false], [1, true]] as const) {
        const p = fresh();
        applyBackGait(p, g, amount, 1, 13, 77, reduced);
        expect(p).toEqual(fresh());
      }
    });
  }
});
