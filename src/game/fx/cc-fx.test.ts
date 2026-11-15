import { describe, expect, it } from 'vitest';
import { RecoveredReason, SimEventKind, SnagEvent, abilitySlugAt, type SimEvent } from '@core/index';
import {
  CC_FRAMES, CC_LINE_SHAPES, CC_LOOKS, CC_PRIORITY, CC_SHAPES, CC_TIER_CAPS, CcTracker, FLUNG_MIN_SPEED, HOLD_IN_TICKS, LATCH_TIMEOUT_TICKS,
  MAX_CC_PARTS_TOTAL, MAX_CC_SEGS_TOTAL, RELEASE_MS, REDUCED_RELEASE_MS, ccParts, ccReleaseParts, ccSuppress, makeCcOut, makeRead, releaseTicks,
  type CcKind, type CcRead,
} from './cc-fx';
import { AURAS } from './ability-aura';
import { IDLE_LINE_SHAPES, IDLE_SHAPES } from './idle-aura';
import { STATUS_LOOKS } from './status-fx';

const ev = (kind: number, tick: number, payload: Record<string, number> = {}): SimEvent =>
  ({ tick, sourceId: 0, kind: kind as SimEvent['kind'], seq: 0, ...payload });
const rd = (o: Partial<CcRead> = {}): CcRead => ({ ...makeRead(), ...o });
let tornado = -1;
for (let i = 0; i < 200 && tornado < 0; i++) if (abilitySlugAt(i) === 'tornado') tornado = i;
const BOX = { x: 100, y: 100, w: 60, h: 90 };

describe('looks and shapes', () => {
  it('words are at most 8 characters and glyphs are distinct', () => {
    const seen = new Set<string>();
    for (const k of CC_PRIORITY) {
      const l = CC_LOOKS[k];
      expect(l.word.length).toBeLessThanOrEqual(8);
      expect(l.word).not.toMatch(/classic|arcade|ruleset|capture/i);
      expect(l.glyph.length % 2).toBe(0);
      expect(l.glyph.every((v) => v >= -1 && v <= 1)).toBe(true);
      seen.add(l.glyph.join(','));
    }
    expect(seen.size).toBe(CC_PRIORITY.length);
    expect(new Set(CC_PRIORITY.map((k) => CC_LOOKS[k].word)).size).toBe(CC_PRIORITY.length);
  });
  it('shape names are disjoint from the idle, aura and status sets', () => {
    const taken = new Set<string>([...Object.values(IDLE_SHAPES).flat(), ...IDLE_LINE_SHAPES, ...AURAS.map((a) => a.shape), ...Object.values(STATUS_LOOKS).map((s) => s.label.toLowerCase())]);
    for (const s of CC_SHAPES) expect(taken.has(s)).toBe(false);
    for (const s of CC_LINE_SHAPES) expect(CC_SHAPES).toContain(s);
    expect(CC_FRAMES.length + CC_LINE_SHAPES.length).toBe(CC_SHAPES.length);
  });
  it('every release is a fade of at most 150 ms in reduced motion', () => {
    expect(REDUCED_RELEASE_MS).toBeLessThanOrEqual(150);
    for (const r of Object.keys(RELEASE_MS) as (keyof typeof RELEASE_MS)[]) {
      expect(releaseTicks(r, true) * 20).toBeLessThanOrEqual(150);
      expect(releaseTicks(r, false)).toBeGreaterThan(0);
    }
    expect(releaseTicks('none', false)).toBe(0);
  });
});

describe('CcTracker kinds and priority', () => {
  it('resolves each source to its kind', () => {
    const cases: [Partial<CcRead>, CcKind][] = [
      [{ stunLeft: 30 }, 'reel'], [{ rootLeft: 30 }, 'snared'], [{ mireLeft: 30 }, 'mired'], [{ slowed: true, slowLeft: 9 }, 'drag'],
      [{ locked: true, lockedLeft: 9 }, 'locked'], [{ kbSpeed: FLUNG_MIN_SPEED }, 'flung'],
    ];
    for (const [r, kind] of cases) expect(new CcTracker(2).update(0, 10, rd(r)).kind).toBe(kind);
    expect(new CcTracker(2).update(0, 10, rd({ kbSpeed: FLUNG_MIN_SPEED - 0.1 })).kind).toBe('none');
  });
  it('picks the highest priority and keeps gait scaling under another kind', () => {
    const t = new CcTracker(2);
    const s = t.update(0, 1, rd({ stunLeft: 20, mireLeft: 20, slowed: true, slowLeft: 5, rootLeft: 5 }));
    expect(s.kind).toBe('reel');
    expect(s.gait).toBeLessThan(1);
    expect(t.update(1, 1, rd({ locked: true, lockedLeft: 5, stunLeft: 5 })).kind).toBe('locked');
    expect(t.update(1, 2, rd({ rootLeft: 5, mireLeft: 5 })).kind).toBe('snared');
    expect(t.update(1, 3, rd({ mireLeft: 5, slowed: true, slowLeft: 5 })).kind).toBe('mired');
  });
  it('eases the hold in over HOLD_IN_TICKS and never holds walking kinds', () => {
    const t = new CcTracker(1);
    expect(t.update(0, 10, rd({ stunLeft: 30 })).hold).toBe(0);
    expect(t.update(0, 10 + HOLD_IN_TICKS / 2, rd({ stunLeft: 28 })).hold).toBeCloseTo(0.5, 5);
    expect(t.update(0, 10 + HOLD_IN_TICKS, rd({ stunLeft: 26 })).hold).toBe(1);
    expect(new CcTracker(1).update(0, 10, rd({ mireLeft: 9 })).hold).toBe(0);
  });
  it('is idempotent per tick', () => {
    const t = new CcTracker(1);
    t.update(0, 5, rd({ stunLeft: 5 }));
    const a = JSON.stringify(t.update(0, 9, rd({ stunLeft: 1 })));
    expect(JSON.stringify(t.update(0, 9, rd({ stunLeft: 1 })))).toBe(a);
    const e = JSON.stringify(t.update(0, 10, rd()));
    expect(JSON.stringify(t.update(0, 10, rd()))).toBe(e);
  });
});

describe('CcTracker latches', () => {
  it('a guard break gives stagger until that stun ends', () => {
    const t = new CcTracker(2);
    t.feed(ev(SimEventKind.guardBroken, 10, { target: 1 }), 10);
    expect(t.update(1, 10, rd({ stunLeft: 40 })).kind).toBe('stagger');
    expect(t.update(1, 20, rd({ stunLeft: 30 })).kind).toBe('stagger');
    expect(t.update(1, 51, rd()).kind).toBe('none');
    expect(t.update(1, 60, rd({ stunLeft: 30 })).kind).toBe('reel');
  });
  it('a guard break that lands during a stun still colours it', () => {
    const t = new CcTracker(1);
    t.update(0, 5, rd({ stunLeft: 30 }));
    t.feed(ev(SimEventKind.guardBroken, 6, { target: 0 }), 6);
    const s = t.update(0, 6, rd({ stunLeft: 29 }));
    expect(s.kind).toBe('stagger');
    expect(s.releaseSeq).toBe(0);
  });
  it('a latch with no stun is dropped after the timeout', () => {
    const t = new CcTracker(1);
    t.feed(ev(SimEventKind.guardBroken, 1, { target: 0 }), 1);
    t.update(0, 1 + LATCH_TIMEOUT_TICKS + 2, rd());
    expect(t.update(0, 30, rd({ stunLeft: 9 })).kind).toBe('reel');
  });
  it('a parried melee attacker gets recoil; a reflected shot gives nothing', () => {
    const t = new CcTracker(2);
    t.feed(ev(SimEventKind.parried, 4, { target: 0, attacker: 1, reflected: 0 }), 4);
    expect(t.update(1, 4, rd({ stunLeft: 20 })).kind).toBe('recoil');
    const u = new CcTracker(2);
    u.feed(ev(SimEventKind.parried, 4, { target: 0, attacker: 1, reflected: 1 }), 4);
    expect(u.update(1, 4, rd({ stunLeft: 20 })).kind).toBe('reel');
  });
  it('a Tornado hit gives gust and other abilities do not', () => {
    expect(tornado).toBeGreaterThanOrEqual(0);
    const t = new CcTracker(2);
    t.feed(ev(SimEventKind.hitConfirmed, 4, { target: 1, ability: tornado }), 4);
    expect(t.update(1, 4, rd({ stunLeft: 20 })).kind).toBe('gust');
    const u = new CcTracker(2);
    u.feed(ev(SimEventKind.hitConfirmed, 4, { target: 1, ability: 0x100 }), 4);
    expect(u.update(1, 4, rd({ stunLeft: 20 })).kind).toBe('reel');
  });
  it('stagger outranks gust and reel', () => {
    const t = new CcTracker(1);
    t.feed(ev(SimEventKind.hitConfirmed, 4, { target: 0, ability: tornado }), 4);
    t.feed(ev(SimEventKind.guardBroken, 4, { target: 0 }), 4);
    expect(t.update(0, 4, rd({ stunLeft: 20 })).kind).toBe('stagger');
  });
});

describe('CcTracker releases', () => {
  function endStun(reason: number | undefined): ReturnType<CcTracker['update']> {
    const t = new CcTracker(1);
    t.update(0, 1, rd({ stunLeft: 30 }));
    if (reason !== undefined) t.feed(ev(SimEventKind.recovered, 31, { id: 0, reason }), 31);
    return t.update(0, 31, rd());
  }
  it('a natural stun end shakes off', () => {
    const s = endStun(RecoveredReason.stunEnded);
    expect(s.release).toBe('shake');
    expect(s.releaseFresh).toBe(true);
    expect(s.breakout).toBe(false);
  });
  it('a cap break-out snaps and flags the ring', () => {
    for (const r of [RecoveredReason.juggleCap, RecoveredReason.stunCap]) {
      const s = endStun(r);
      expect(s.release).toBe('snap');
      expect(s.breakout).toBe(true);
    }
  });
  it('fires once per end and the freshness lasts one tick', () => {
    const t = new CcTracker(1);
    t.update(0, 1, rd({ stunLeft: 30 }));
    expect(t.update(0, 31, rd()).releaseSeq).toBe(1);
    expect(t.update(0, 31, rd()).releaseSeq).toBe(1);
    const later = t.update(0, 32, rd());
    expect(later.releaseSeq).toBe(1);
    expect(later.releaseFresh).toBe(false);
    expect(later.releaseAge).toBe(1);
    t.update(0, 40, rd({ stunLeft: 30 }));
    expect(t.update(0, 70, rd()).releaseSeq).toBe(2);
  });
  it('being pre-empted by a higher kind is not a release', () => {
    const t = new CcTracker(1);
    t.update(0, 1, rd({ mireLeft: 50 }));
    t.update(0, 2, rd({ mireLeft: 49, rootLeft: 20 }));
    expect(t.state(0).releaseSeq).toBe(0);
    // the snare then ends while the mire goes on: that is the snare's own release
    expect(t.update(0, 3, rd({ mireLeft: 48 })).release).toBe('slack');
    expect(t.state(0).releaseSeq).toBe(1);
    expect(t.update(0, 4, rd()).release).toBe('glob');
  });
  it('snare: slack on expiry, burst when freed by fire, dissolve when cleansed', () => {
    const run = (e?: SimEvent): string => {
      const t = new CcTracker(2);
      t.update(1, 1, rd({ rootLeft: 30 }));
      if (e) t.feed(e, 2);
      return t.update(1, 2, rd()).release;
    };
    expect(run()).toBe('slack');
    expect(run(ev(SimEventKind.snag, 2, { id: 1, reason: SnagEvent.expired }))).toBe('slack');
    expect(run(ev(SimEventKind.snag, 2, { id: 1, reason: SnagEvent.freed }))).toBe('burst');
    expect(run(ev(SimEventKind.cleanse, 2, { sourceId: 1 }))).toBe('dissolve');
  });
  it('other kinds release with their own beat', () => {
    const rel = (r: Partial<CcRead>): string => {
      const t = new CcTracker(1);
      t.update(0, 1, rd(r));
      return t.update(0, 2, rd()).release;
    };
    expect(rel({ slowed: true, slowLeft: 5 })).toBe('lighten');
    expect(rel({ locked: true, lockedLeft: 5 })).toBe('crack');
    expect(rel({ kbSpeed: 9 })).toBe('settle');
  });
  it('a reset slot forgets its latches and releases', () => {
    const t = new CcTracker(2);
    t.feed(ev(SimEventKind.guardBroken, 1, { target: 1 }), 1);
    t.update(1, 1, rd({ stunLeft: 9 }));
    t.update(1, 2, rd());
    t.reset(1);
    expect(t.state(1).releaseSeq).toBe(0);
    expect(t.update(1, 3, rd({ stunLeft: 9 })).kind).toBe('reel');
  });
  it('ignores events for slots out of range', () => {
    const t = new CcTracker(2);
    t.feed(ev(SimEventKind.guardBroken, 1, { target: 99 }), 1);
    t.feed(ev(SimEventKind.recovered, 1, { id: 99, reason: 0 }), 1);
    t.feed(ev(SimEventKind.snag, 1, { id: 99, reason: SnagEvent.freed }), 1);
    t.feed(ev(SimEventKind.cleanse, 1, { sourceId: 99 }), 1);
    expect(t.update(0, 1, rd()).kind).toBe('none');
  });
});

describe('ccParts', () => {
  const kinds: CcKind[] = [...CC_PRIORITY];
  it('reduced motion gives identical parts at any age', () => {
    for (const k of kinds) {
      const a = makeCcOut();
      const b = makeCcOut();
      const na = ccParts(k, BOX, 3, 40, true, 'full', 7, a);
      const nb = ccParts(k, BOX, 300, 40, true, 'full', 7, b);
      expect(na).toBe(nb);
      expect(JSON.stringify(a.parts.slice(0, na))).toBe(JSON.stringify(b.parts.slice(0, nb)));
      expect(a.nSegs).toBe(b.nSegs);
      expect(Array.from(a.lines.slice(0, a.nSegs * 6))).toEqual(Array.from(b.lines.slice(0, b.nSegs * 6)));
    }
  });
  it('animates when motion is allowed', () => {
    const a = makeCcOut();
    const b = makeCcOut();
    ccParts('gust', BOX, 3, 40, false, 'full', 1, a);
    ccParts('gust', BOX, 20, 40, false, 'full', 1, b);
    expect(a.nSegs).toBeGreaterThan(0);
    expect(Array.from(a.lines.slice(0, 12))).not.toEqual(Array.from(b.lines.slice(0, 12)));
  });
  it('uses only known shapes and finite values', () => {
    for (const k of kinds) {
      const o = makeCcOut();
      const n = ccParts(k, BOX, 11, 30, false, 'full', 3, o);
      for (let i = 0; i < n; i++) {
        const p = o.parts[i];
        expect(CC_FRAMES).toContain(p?.frame);
        expect([p?.x, p?.y, p?.size, p?.alpha, p?.rot].every((v) => Number.isFinite(v))).toBe(true);
      }
      for (let i = 0; i < o.nSegs * 6; i++) expect(Number.isFinite(o.lines[i])).toBe(true);
    }
  });
  it('only long stuns show motes', () => {
    const o = makeCcOut();
    expect(ccParts('reel', BOX, 0, 20, false, 'full', 0, o)).toBe(0);
    expect(ccParts('reel', BOX, 0, 40, false, 'full', 0, o)).toBe(3);
    expect(ccParts('none', BOX, 0, 40, false, 'full', 0, o)).toBe(0);
  });
  it('is deterministic and does not allocate or grow its buffers', () => {
    const o = makeCcOut();
    const parts = o.parts;
    const lines = o.lines;
    const len = parts.length;
    const first = ccParts('mired', BOX, 9, 30, false, 'full', 5, o);
    const snap = JSON.stringify(o.parts.slice(0, first));
    for (let i = 0; i < 50; i++) for (const k of kinds) ccParts(k, BOX, i, 30, i % 2 === 0, 'full', i, o);
    expect(ccParts('mired', BOX, 9, 30, false, 'full', 5, o)).toBe(first);
    expect(JSON.stringify(o.parts.slice(0, first))).toBe(snap);
    expect(o.parts).toBe(parts);
    expect(o.lines).toBe(lines);
    expect(o.parts.length).toBe(len);
  });
  it('respects the tier caps, and four heroes fit the frame totals', () => {
    expect(CC_TIER_CAPS.full.parts * 4).toBeLessThanOrEqual(MAX_CC_PARTS_TOTAL);
    expect(CC_TIER_CAPS.full.segs * 4).toBeLessThanOrEqual(MAX_CC_SEGS_TOTAL);
    expect(CC_TIER_CAPS.phone.parts).toBeLessThan(CC_TIER_CAPS.full.parts);
    expect(CC_TIER_CAPS.min.parts).toBeLessThan(CC_TIER_CAPS.phone.parts);
    for (const tier of ['full', 'phone', 'min'] as const) {
      for (const k of kinds) {
        const o = makeCcOut();
        const n = ccParts(k, BOX, 5, 60, false, tier, 2, o);
        expect(n).toBeLessThanOrEqual(CC_TIER_CAPS[tier].parts);
        expect(o.nSegs).toBeLessThanOrEqual(CC_TIER_CAPS[tier].segs);
      }
    }
    const tiny = makeCcOut(2, 3);
    ccParts('mired', BOX, 5, 60, false, 'full', 2, tiny);
    expect(tiny.nParts).toBeLessThanOrEqual(2);
    ccParts('gust', BOX, 5, 60, false, 'full', 2, tiny);
    expect(tiny.nSegs).toBeLessThanOrEqual(3);
  });
});

describe('ccReleaseParts and ccSuppress', () => {
  it('drops globs and flies a gust band off, then ends', () => {
    const o = makeCcOut();
    o.nParts = 0;
    o.nSegs = 0;
    expect(ccReleaseParts('glob', BOX, 2, false, 'full', 1, o)).toBe(2);
    o.nParts = 0;
    ccReleaseParts('unwind', BOX, 2, false, 'full', 1, o);
    expect(o.nSegs).toBeGreaterThan(0);
    o.nParts = 0;
    o.nSegs = 0;
    expect(ccReleaseParts('glob', BOX, releaseTicks('glob', false) + 1, false, 'full', 1, o)).toBe(0);
    expect(ccReleaseParts('none', BOX, 0, false, 'full', 1, o)).toBe(0);
  });
  it('dims or hides the idle auras', () => {
    expect(ccSuppress('none')).toBe(0);
    expect(ccSuppress('reel')).toBe(1);
    expect(ccSuppress('locked')).toBe(2);
  });
});
