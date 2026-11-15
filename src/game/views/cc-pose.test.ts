import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '@core/index';
import { CC_PRIORITY, RELEASE_MS, REDUCED_RELEASE_MS, type CcRelease } from '../fx/cc-fx';
import {
  CC_ALPHA_MIN, CC_OFFSET_MAX, CC_ROT_MAX, CC_STYLE, applyCcPose, applyCcRelease, ccFamilyOf, ccStyleOf, type CcFamily,
} from './cc-pose';
import { resetPose, type Pose } from './pose-math';

const FAMILIES: CcFamily[] = ['legged', 'winged', 'column', 'mass', 'flame', 'stone', 'void'];
const RELEASES = Object.keys(RELEASE_MS) as Exclude<CcRelease, 'none'>[];
const fresh = (): Pose => resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
const loud = { amp: 3, period: 0.5, extra: 3 };

describe('ccFamilyOf', () => {
  it('resolves every character to a family', () => {
    for (const c of CHARACTERS) expect(FAMILIES).toContain(ccFamilyOf(c.sprite, c.element));
  });
  it('maps the roster as designed', () => {
    expect(ccFamilyOf('pax', 'earth')).toBe('legged');
    expect(ccFamilyOf('treenoc', 'earth')).toBe('legged');
    expect(ccFamilyOf('sindarosa', 'fire')).toBe('winged');
    expect(ccFamilyOf('cyclonius', 'air')).toBe('column');
    expect(ccFamilyOf('curomo', 'water')).toBe('mass');
    expect(ccFamilyOf('fiara', 'fire')).toBe('flame');
    expect(ccFamilyOf('rokcore', 'earth')).toBe('stone');
    expect(ccFamilyOf('eternalVoid', 'void')).toBe('void');
    expect(ccFamilyOf('dummyTarget', 'void')).toBe('void');
    expect(ccFamilyOf('whoever', 'none')).toBe('void');
  });
  it('style rows only name known sprites and give defaults otherwise', () => {
    const sprites = new Set(CHARACTERS.map((c) => c.sprite));
    for (const k of Object.keys(CC_STYLE)) expect(sprites.has(k)).toBe(true);
    expect(ccStyleOf('nobody')).toEqual({ amp: 1, period: 1, extra: 1 });
    expect(ccStyleOf('lavax').amp).toBe(0.8);
  });
});

describe('applyCcPose bounds', () => {
  it('stays inside the bounds, never touches sx/sy, for every kind, family and age', () => {
    for (const style of [ccStyleOf('x'), loud]) {
      for (const kind of CC_PRIORITY) {
        for (const family of FAMILIES) {
          for (const reduced of [false, true]) {
            for (let ms = 0; ms < 3000; ms += 37) {
              for (const side of [-1, 1]) {
                const p = fresh();
                applyCcPose(p, kind, family, style, 1, ms, side, 1, reduced);
                expect(Math.abs(p.rot)).toBeLessThanOrEqual(CC_ROT_MAX);
                expect(Math.abs(p.ox)).toBeLessThanOrEqual(CC_OFFSET_MAX);
                expect(Math.abs(p.oy)).toBeLessThanOrEqual(CC_OFFSET_MAX);
                expect(p.alpha).toBeGreaterThanOrEqual(CC_ALPHA_MIN);
                expect(p.alpha).toBeLessThanOrEqual(1);
                expect(p.sx).toBe(1);
                expect(p.sy).toBe(1);
              }
            }
          }
        }
      }
    }
  });
  it('reduced motion ignores the age', () => {
    for (const kind of CC_PRIORITY) {
      for (const family of FAMILIES) {
        const a = fresh();
        const b = fresh();
        applyCcPose(a, kind, family, ccStyleOf('x'), 1, 10, 1, 0.5, true);
        applyCcPose(b, kind, family, ccStyleOf('x'), 1, 1234, 1, 0.5, true);
        expect(a).toEqual(b);
      }
    }
  });
  it('moves with age when motion is allowed, and a zero hold adds nothing for holding kinds', () => {
    const a = fresh();
    const b = fresh();
    applyCcPose(a, 'reel', 'column', ccStyleOf('x'), 1, 100, 1, 0, false);
    applyCcPose(b, 'reel', 'column', ccStyleOf('x'), 1, 400, 1, 0, false);
    expect(a.rot).not.toBe(b.rot);
    const z = fresh();
    applyCcPose(z, 'reel', 'legged', ccStyleOf('x'), 0, 400, 1, 0, false);
    expect(z).toEqual(fresh());
    const n = fresh();
    applyCcPose(n, 'none', 'legged', ccStyleOf('x'), 1, 400, 1, 0, false);
    expect(n).toEqual(fresh());
  });
  it('is thrown away from the attacker by side', () => {
    const l = fresh();
    const r = fresh();
    applyCcPose(l, 'stagger', 'void', ccStyleOf('x'), 1, 0, -1, 0, true);
    applyCcPose(r, 'stagger', 'void', ccStyleOf('x'), 1, 0, 1, 0, true);
    expect(l.rot).toBe(-r.rot);
    expect(r.rot).toBeGreaterThan(0);
  });
  it('adds to the pose it is given and keeps the amplitude style effective', () => {
    const p = fresh();
    p.rot = 10;
    applyCcPose(p, 'reel', 'legged', ccStyleOf('x'), 1, 0, 1, 0, true);
    expect(p.rot).toBeGreaterThan(10);
    const weak = fresh();
    const strong = fresh();
    applyCcPose(weak, 'stagger', 'void', { amp: 0.5, period: 1, extra: 1 }, 1, 175, 1, 0, false);
    applyCcPose(strong, 'stagger', 'void', { amp: 1, period: 1, extra: 1 }, 1, 175, 1, 0, false);
    expect(Math.abs(weak.rot)).toBeLessThan(Math.abs(strong.rot));
  });
});

describe('applyCcRelease', () => {
  it('stays inside the bounds and ends cleanly', () => {
    for (const rel of RELEASES) {
      for (const family of FAMILIES) {
        for (const reduced of [false, true]) {
          const len = reduced ? REDUCED_RELEASE_MS : RELEASE_MS[rel];
          for (let ms = -10; ms <= len + 40; ms += 5) {
            const p = fresh();
            applyCcRelease(p, rel, family, loud, ms, -1, reduced);
            expect(Math.abs(p.rot)).toBeLessThanOrEqual(CC_ROT_MAX);
            expect(Math.abs(p.ox)).toBeLessThanOrEqual(CC_OFFSET_MAX);
            expect(Math.abs(p.oy)).toBeLessThanOrEqual(CC_OFFSET_MAX);
            expect(p.alpha).toBeGreaterThanOrEqual(CC_ALPHA_MIN);
            expect(p.sx).toBe(1);
            expect(p.sy).toBe(1);
            if (ms < 0 || ms >= len) expect(p).toEqual(fresh());
          }
        }
      }
    }
    const n = fresh();
    applyCcRelease(n, 'none', 'void', loud, 10, 1, false);
    expect(n).toEqual(fresh());
  });
  it('reduced motion is a fade only: no rot or offsets', () => {
    for (const rel of RELEASES) {
      const p = fresh();
      applyCcRelease(p, rel, 'flame', ccStyleOf('x'), 20, 1, true);
      expect(p.rot).toBe(0);
      expect(p.ox).toBe(0);
      expect(p.oy).toBe(0);
      expect(p.alpha).toBeLessThan(1);
    }
  });
  it('shake-off wobbles sideways and flames flare up on release', () => {
    let maxOx = 0;
    for (let ms = 0; ms < 140; ms += 5) {
      const p = fresh();
      applyCcRelease(p, 'shake', 'legged', ccStyleOf('x'), ms, 1, false);
      maxOx = Math.max(maxOx, Math.abs(p.ox));
    }
    expect(maxOx).toBeGreaterThan(0.5);
    const f = fresh();
    applyCcRelease(f, 'shake', 'flame', ccStyleOf('x'), 10, 1, false);
    expect(f.oy).toBeLessThan(0);
  });
});
