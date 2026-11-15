import { describe, expect, it } from 'vitest';
import type { IdleElement, IdleLook } from '../platform/idle-look';
import { ELEMENT_IDLE_DEFAULTS, IDLE_LOOKS } from '../platform/idle-look';
import type { Box } from '../views/hero-scale';
import { AURAS } from './ability-aura';
import {
  BOX_MARGIN, INNER_ALPHA_MAX, LINES, LINE_STRIDE, MAX_PARTS_TOTAL, PARTS, StrikeBudget, TIER_CAPS, IDLE_SHAPES,
  fxTier, idleLines, idleParts, makeCtx, makeParts, strikeAge, type IdleCtx, type IdleTier,
} from './idle-aura';
import { STATUS_LOOKS } from './status-fx';

const ELS: IdleElement[] = ['fire', 'air', 'earth', 'water', 'void'];
const BIG: Box = { x: 100, y: 200, w: 60, h: 100 };
const SMALL: Box = { x: 100, y: 200, w: 30, h: 30 };
const looks: IdleLook[] = [...Object.values(IDLE_LOOKS), ...Object.values(ELEMENT_IDLE_DEFAULTS)].filter((l) => l.element !== 'none');
const at = <T>(a: ArrayLike<T>, i: number): T => a[i] as T;
const ctx = (over: Partial<IdleCtx> = {}): IdleCtx => ({ ...makeCtx(), ...over });

describe('tier caps', () => {
  it('part and segment counts respect the tier for every look, box size and time', () => {
    for (const tier of ['full', 'phone', 'min'] as IdleTier[]) {
      for (const look of looks) {
        for (const box of [BIG, SMALL]) {
          for (let age = 0; age < 400; age += 13) {
            const c = ctx({ tier, age, salt: age, strike: age % 6 });
            const n = idleParts(look, box, c, PARTS, 0);
            expect(n, `${tier} ${look.signature}`).toBeLessThanOrEqual(TIER_CAPS[tier].parts);
            const m = idleLines(look, box, c, LINES, 0);
            expect(m, `${tier} ${look.signature}`).toBeLessThanOrEqual(TIER_CAPS[tier].segs);
          }
        }
      }
    }
  });
  it('small boxes halve the particle counts', () => {
    const look = ELEMENT_IDLE_DEFAULTS.fire;
    const c = ctx({ age: 10 });
    expect(idleParts(look, SMALL, c, PARTS, 0)).toBeLessThan(idleParts(look, BIG, c, PARTS, 0));
  });
  it('none element or zero amount writes nothing', () => {
    expect(idleParts({ element: 'none', signature: 'none', motif: 'none', amount: 0 }, BIG, ctx(), PARTS, 0)).toBe(0);
    expect(idleLines({ ...ELEMENT_IDLE_DEFAULTS.air, amount: 0 }, BIG, ctx(), LINES, 0)).toBe(0);
  });
});

describe('readability', () => {
  const inInner = (x: number, y: number, b: Box): boolean => x >= b.x + 0.15 * b.w && x <= b.x + 0.85 * b.w && y >= b.y + 0.15 * b.h && y <= b.y + 0.85 * b.h;
  it('parts stay in the box expanded by 25 percent and the inner zone alpha sum is capped', () => {
    for (const look of looks) {
      for (let age = 0; age < 600; age += 7) {
        for (const reduced of [false, true]) {
          const c = ctx({ age, salt: age * 3, reduced, tier: 'full' });
          const n = idleParts(look, BIG, c, PARTS, 0);
          let inner = 0;
          for (let i = 0; i < n; i++) {
            const p = at(PARTS, i);
            expect(p.x).toBeGreaterThanOrEqual(BIG.x - BOX_MARGIN * BIG.w - 1e-6);
            expect(p.x).toBeLessThanOrEqual(BIG.x + (1 + BOX_MARGIN) * BIG.w + 1e-6);
            expect(p.y).toBeGreaterThanOrEqual(BIG.y - BOX_MARGIN * BIG.h - 1e-6);
            expect(p.y).toBeLessThanOrEqual(BIG.y + (1 + BOX_MARGIN) * BIG.h + 1e-6);
            expect(p.alpha).toBeGreaterThanOrEqual(0);
            if (inInner(p.x, p.y, BIG)) inner += p.alpha;
          }
          expect(inner, look.signature).toBeLessThanOrEqual(INNER_ALPHA_MAX + 1e-6);
        }
      }
    }
  });
  it('line segment ends stay in the expanded box', () => {
    for (const look of looks) {
      for (let age = 0; age < 300; age += 11) {
        const m = idleLines(look, BIG, ctx({ age, strike: age % 5 }), LINES, 0);
        for (let i = 0; i < m; i++) {
          const o = i * LINE_STRIDE;
          for (const k of [0, 2]) {
            expect(at(LINES, o + k)).toBeGreaterThanOrEqual(BIG.x - BOX_MARGIN * BIG.w - 1e-4);
            expect(at(LINES, o + k)).toBeLessThanOrEqual(BIG.x + (1 + BOX_MARGIN) * BIG.w + 1e-4);
          }
          for (const k of [1, 3]) {
            expect(at(LINES, o + k)).toBeGreaterThanOrEqual(BIG.y - BOX_MARGIN * BIG.h - 1e-4);
            expect(at(LINES, o + k)).toBeLessThanOrEqual(BIG.y + (1 + BOX_MARGIN) * BIG.h + 1e-4);
          }
        }
      }
    }
  });
  it('strike bolt alpha is at most 0.55', () => {
    for (let strike = 0; strike < 6; strike++) {
      const m = idleLines(ELEMENT_IDLE_DEFAULTS.air, BIG, ctx({ age: 20, strike, salt: 5 }), LINES, 0);
      for (let i = 0; i < m; i++) expect(at(LINES, i * LINE_STRIDE + 4)).toBeLessThanOrEqual(0.55);
    }
  });
});

describe('determinism and reduced motion', () => {
  const snap = (look: IdleLook, c: IdleCtx): string => {
    const n = idleParts(look, BIG, c, PARTS, 0);
    return JSON.stringify(PARTS.slice(0, n));
  };
  it('same inputs give the same output', () => {
    for (const look of looks) expect(snap(look, ctx({ age: 77, salt: 9 }))).toBe(snap(look, ctx({ age: 77, salt: 9 })));
  });
  it('different salts scatter differently', () => {
    for (const el of ELS) {
      const look = ELEMENT_IDLE_DEFAULTS[el];
      expect(snap(look, ctx({ age: 40, salt: 1 })), el).not.toBe(snap(look, ctx({ age: 40, salt: 2 })));
    }
  });
  it('reduced motion does not depend on age', () => {
    for (const look of looks) {
      expect(snap(look, ctx({ age: 3, salt: 4, reduced: true }))).toBe(snap(look, ctx({ age: 999, salt: 4, reduced: true })));
      const a = idleLines(look, BIG, ctx({ age: 3, reduced: true }), LINES, 0);
      const first = Array.from(LINES.subarray(0, a * LINE_STRIDE));
      const b = idleLines(look, BIG, ctx({ age: 999, reduced: true }), LINES, 0);
      expect(b).toBe(a);
      expect(Array.from(LINES.subarray(0, b * LINE_STRIDE))).toEqual(first);
    }
  });
  it('moving changes output over time (not frozen when motion is on)', () => {
    const look = ELEMENT_IDLE_DEFAULTS.fire;
    expect(snap(look, ctx({ age: 10 }))).not.toBe(snap(look, ctx({ age: 50 })));
  });
});

describe('air strikes', () => {
  it('strikeAge is deterministic, 3..5 ticks long, once per period', () => {
    for (const salt of [1, 7, 977, 12345]) {
      let run = 0;
      let starts = 0;
      for (let tick = 0; tick < 1000; tick++) {
        const a = strikeAge(salt, tick);
        if (a >= 0) {
          expect(a).toBe(run);
          run++;
          if (a === 0) starts++;
        } else {
          if (run > 0) {
            expect(run).toBeGreaterThanOrEqual(3);
            expect(run).toBeLessThanOrEqual(5);
          }
          run = 0;
        }
      }
      expect(starts).toBeGreaterThan(10);
    }
  });
  it('four air heroes: at least 17 ticks apart each and at most 3 per second overall across 500 ticks', () => {
    const budget = new StrikeBudget();
    const granted: number[] = [];
    const per: number[][] = [[], [], [], []];
    for (let tick = 0; tick < 500; tick++) {
      for (let h = 0; h < 4; h++) {
        if (strikeAge(h * 977 + 31, tick) === 0 && budget.allow(h, tick)) {
          granted.push(tick);
          at(per, h).push(tick);
        }
      }
    }
    expect(granted.length).toBeGreaterThan(0);
    for (const list of per) for (let i = 1; i < list.length; i++) expect(at(list, i) - at(list, i - 1)).toBeGreaterThanOrEqual(17);
    for (let i = 0; i + 3 < granted.length; i++) expect(at(granted, i + 3) - at(granted, i), 'more than 3 in a window').toBeGreaterThanOrEqual(50);
  });
  it('the budget refuses back-to-back asks and resets when time goes backwards', () => {
    const b = new StrikeBudget();
    expect(b.allow(0, 100)).toBe(true);
    expect(b.allow(0, 105)).toBe(false);
    expect(b.allow(0, 5)).toBe(true);
  });
});

describe('shape sets', () => {
  const all = ELS.flatMap((e) => IDLE_SHAPES[e]);
  it('are disjoint from each other', () => {
    expect(new Set(all).size).toBe(all.length);
  });
  it('are disjoint from ability aura shapes and status looks', () => {
    const aura = new Set<string>(AURAS.map((a) => a.shape));
    const status = new Set<string>(Object.values(STATUS_LOOKS).map((s) => s.label.toLowerCase()));
    for (const s of all) {
      expect(aura.has(s), s).toBe(false);
      expect(status.has(s), s).toBe(false);
    }
  });
  it('every emitted part frame belongs to its element shape set', () => {
    for (const look of looks) {
      const n = idleParts(look, BIG, ctx({ age: 33 }), PARTS, 0);
      for (let i = 0; i < n; i++) expect(IDLE_SHAPES[look.element as IdleElement], look.signature).toContain(at(PARTS, i).frame);
    }
  });
});

describe('buffers', () => {
  it('are reused: no allocation, parts keep their identity', () => {
    const out = makeParts(MAX_PARTS_TOTAL);
    const ids = out.slice();
    const lines = new Float32Array(160 * LINE_STRIDE);
    for (const look of looks) {
      idleParts(look, BIG, ctx({ age: 5 }), out, 0);
      idleLines(look, BIG, ctx({ age: 5 }), lines, 0);
    }
    for (let i = 0; i < out.length; i++) expect(out[i]).toBe(ids[i]);
    expect(lines.length).toBe(160 * LINE_STRIDE);
  });
  it('write after `start` without touching earlier entries', () => {
    const out = makeParts(MAX_PARTS_TOTAL);
    const n1 = idleParts(ELEMENT_IDLE_DEFAULTS.fire, BIG, ctx({ age: 5 }), out, 0);
    const before = JSON.stringify(out.slice(0, n1));
    idleParts(ELEMENT_IDLE_DEFAULTS.water, BIG, ctx({ age: 5 }), out, n1);
    expect(JSON.stringify(out.slice(0, n1))).toBe(before);
  });
});

describe('fxTier', () => {
  it('coarse pointers get phone, fine many-core machines get full', () => {
    expect(fxTier(true, 16, 10)).toBe('phone');
    expect(fxTier(false, 8, 10)).toBe('full');
    expect(fxTier(false, 4, 10)).toBe('phone');
    expect(fxTier(false, 0, 10)).toBe('full');
  });
  it('the governor only steps down', () => {
    expect(fxTier(false, 8, 40)).toBe('phone');
    expect(fxTier(false, 8, 40, 'phone')).toBe('min');
    expect(fxTier(false, 8, 40, 'min')).toBe('min');
    expect(fxTier(false, 8, 5, 'phone')).toBe('phone');
    expect(fxTier(false, 8, 5, 'min')).toBe('min');
  });
});
