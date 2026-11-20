import { describe, expect, it } from 'vitest';
import {
  ALL_ABILITIES, Cmd, DEFAULT_SIM_FLAGS, RandomBot, SIM_VERSION, SimEventKind, characterId, collectCommands, createMatch, step,
  type SimEvent,
} from '@core/index';
import { cueFor } from '../audio/sound-map';
import {
  CLASSIC_HIT_TINT, CosmeticRng, ELEMENT_COLORS, EventDeduper, EventFx, HIT_PARTICLES, KO_SHAKE, SHAKE_BY_STRENGTH,
  SPARKS_BY_STRENGTH, SPIN_REPEAT_WINDOW_TICKS, type FxSink,
} from './event-fx';
import { shakeBoost } from './hit-feel';
import { rotationForDir } from '../views/projectile-view';

const dmg = (tick: number, seq: number, target = 3): SimEvent =>
  ({ tick, sourceId: 9, kind: SimEventKind.damage, seq, target, attacker: 1, amount: 5 });
const confirmed = (tick: number, strength: number, extra: Record<string, number> = {}): SimEvent => ({
  tick, sourceId: 9, kind: SimEventKind.hitConfirmed, seq: 1, target: 3, attacker: 1, ability: 0, strength,
  amount: 12, scalePm: 1000, combo: 1, dir: 0, counter: 0, ...extra,
});
const stop = (tick: number, ticks: number, cause = 0): SimEvent =>
  ({ tick, sourceId: 9, kind: SimEventKind.hitStop, seq: 2, ticks, cause });

/** Fake sink: one log line per call, so tests read like the effect sequence. */
function recorder(): { sink: FxSink; log: string[]; holds: number[]; supers: string[] } {
  const log: string[] = [];
  const supers: string[] = [];
  const holds: number[] = [];
  return {
    log,
    holds,
    supers,
    sink: {
      flash: (t, tint, hold) => {
        log.push(`flash${String(t)}:${tint.toString(16)}`);
        holds.push(hold ?? 0);
      },
      burst: (t, o, n, c) => {
        for (let i = 0; i < n * 2; i++) expect(Math.abs(o[i] ?? 9)).toBeLessThanOrEqual(1);
        (c === 0xd9b24c ? supers : log).push(`burst${String(t)}x${String(n)}:${c.toString(16)}`);
      },
      spark: (t) => log.push(`spark${String(t)}`),
      shake: (ms, i) => log.push(`shake${String(ms)}@${String(i)}`),
      jitter: (t, until) => log.push(`jitter${String(t)}<${String(until)}`),
      number: (t, a, scaled, counter) => log.push(`number${String(t)}=${String(a)}${scaled ? 's' : ''}${counter ? 'c' : ''}`),
      superHit: (t, a, f, flash, r) => supers.push(`superHit${String(t)}=${String(a)}@${f.toFixed(2)}${flash ? 'F' : ''}${r ? 'r' : ''}`),
      superCut: (c, from, until, reduced) => log.push(`super${String(c)}@${String(from)}<${String(until)}${reduced ? 'r' : ''}`),
    },
  };
}

const arcadeFx = (sink: FxSink, reduced = false): EventFx =>
  new EventFx(sink, { reducedMotion: () => reduced, arcade: true, elementOf: (id) => (id === 1 ? 'fire' : undefined) });

describe('EventFx plain-hit weight (QA r34)', () => {
  it('fans streaks and recoils the victim on every strength, light included, and drops both under reduced motion', () => {
    for (const reduced of [false, true]) {
      const { sink } = recorder();
      const calls: string[] = [];
      sink.streaks = (a, t, _c, s) => calls.push(`streaks${String(a)}>${String(t)}:${String(s)}`);
      sink.recoil = (a, t, s) => calls.push(`recoil${String(a)}>${String(t)}:${String(s)}`);
      arcadeFx(sink, reduced).consume([confirmed(1, 0), confirmed(2, 2)]);
      expect(calls).toEqual(reduced ? [] : ['streaks1>3:0', 'recoil1>3:0', 'streaks1>3:2', 'recoil1>3:2']);
    }
  });
  it('pops a larger damage number on plain hits, not on supers, scaled hits or under reduced motion (QA r38)', () => {
    for (const reduced of [false, true]) {
      const { sink } = recorder();
      const calls: string[] = [];
      sink.pop = (t, a, size) => calls.push(`pop${String(t)}=${String(a)}@${String(size)}`);
      arcadeFx(sink, reduced).consume([confirmed(1, 0), confirmed(2, 3), confirmed(3, 1, { scalePm: 500 })]);
      expect(calls.length).toBe(reduced ? 0 : 1);
    }
  });
  it('a hit that deals no damage draws no number and no pop, but still flashes and sparks (DMGNUM-1)', () => {
    for (const reduced of [false, true]) {
      const { sink, log } = recorder();
      sink.pop = () => log.push('pop');
      arcadeFx(sink, reduced).consume([confirmed(1, 0, { amount: 0 })]);
      expect(log.filter((l) => l.startsWith('number') || l === 'pop')).toEqual([]);
      expect(log.length).toBeGreaterThan(0);
    }
  });
  it('a popped plain hit shows one floating number: no HUD number beside it; scaled hits, supers and reduced motion keep theirs (QA r39)', () => {
    for (const reduced of [false, true]) {
      const { sink, log } = recorder();
      sink.pop = () => undefined;
      arcadeFx(sink, reduced).consume([confirmed(1, 0), confirmed(2, 1, { scalePm: 500 })]);
      const numbers = log.filter((l) => l.startsWith('number'));
      expect(numbers.length).toBe(reduced ? 2 : 1);
    }
  });
  it('lunges the attacker on plain hits, not under reduced motion', () => {
    for (const reduced of [false, true]) {
      const { sink } = recorder();
      const calls: string[] = [];
      sink.lunge = (a, t, s) => calls.push(`lunge${String(a)}>${String(t)}:${String(s)}`);
      arcadeFx(sink, reduced).consume([confirmed(1, 0)]);
      expect(calls).toEqual(reduced ? [] : ['lunge1>3:0']);
    }
  });
  it('light hits get a camera nudge, weaker than a medium one', () => {
    const [ld = 0, li = 0] = SHAKE_BY_STRENGTH[0] ?? [];
    const [, mi = 0] = SHAKE_BY_STRENGTH[1] ?? [];
    expect(li).toBeGreaterThan(0);
    expect(li).toBeLessThan(mi);
    expect(ld).toBeGreaterThan(0);
  });
});

describe('EventFx water frost', () => {
  it('calls sink.frost on a light water hit, never under reduced motion', () => {
    const calls: string[] = [];
    const mk = (reduced: boolean): EventFx =>
      new EventFx({ ...recorder().sink, frost: (t) => calls.push(`frost${String(t)}`) }, { reducedMotion: () => reduced, arcade: true, elementOf: () => 'water' });
    mk(false).consume([confirmed(3, 1)]);
    mk(true).consume([confirmed(4, 1)]);
    expect(calls).toHaveLength(1);
  });
});

describe('EventFx element signature', () => {
  it('calls sink.signature for fire, earth, air and void specials, also on light hits, never for water or reduced motion', () => {
    const calls: string[] = [];
    const mk = (el: 'fire' | 'earth' | 'air' | 'void' | 'water', reduced: boolean): EventFx =>
      new EventFx({ ...recorder().sink, signature: (t, e) => calls.push(`${e}${String(t)}`) }, { reducedMotion: () => reduced, arcade: true, elementOf: () => el });
    for (const el of ['fire', 'earth', 'air', 'void'] as const) mk(el, false).consume([confirmed(3, 1)]);
    mk('water', false).consume([confirmed(3, 1)]);
    mk('fire', false).consume([confirmed(3, 0)]);
    mk('fire', true).consume([confirmed(3, 1)]);
    expect(calls).toEqual(['fire3', 'earth3', 'air3', 'void3', 'fire3']);
  });
});

describe('EventFx hit sound cue', () => {
  it('asks for the attacker element once per hit, in Classic (damage) and Arcade (hitConfirmed)', () => {
    const calls: string[] = [];
    const opts = { reducedMotion: () => false, elementOf: (id: number) => (id === 1 ? ('fire' as const) : undefined), sfx: (k: string, e: string) => calls.push(`${k}:${e}`) };
    new EventFx(recorder().sink, opts).consume([dmg(1, 0), dmg(1, 0)]);
    new EventFx(recorder().sink, { ...opts, arcade: true }).consume([dmg(2, 0), confirmed(2, 1), confirmed(2, 1)]);
    expect(calls).toEqual(['hit:fire', 'hit:fire']);
  });

  it('falls back to void for an attacker without a view', () => {
    const calls: string[] = [];
    new EventFx(recorder().sink, { reducedMotion: () => false, sfx: (k, e) => calls.push(`${k}:${e}`) }).consume([dmg(1, 0)]);
    expect(calls).toEqual(['hit:void']);
  });
});

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

describe('EventFx, Classic', () => {
  it('fires once per event id even when delivered twice', () => {
    const { sink, log } = recorder();
    const fx = new EventFx(sink, { reducedMotion: () => false });
    fx.consume([dmg(1, 0)]);
    fx.consume([dmg(1, 0), dmg(2, 0)]);
    expect(log.filter((l) => l.startsWith('flash3'))).toHaveLength(2);
    expect(log).toContain(`burst3x${String(HIT_PARTICLES)}:ffddaa`);
    expect(log).toContain(`flash3:${CLASSIC_HIT_TINT.toString(16)}`);
    expect(log).toContain('shake80@0.002');
  });
  it('ignores other events, Arcade events included (Classic never emits them)', () => {
    const { sink, log } = recorder();
    new EventFx(sink, { reducedMotion: () => false }).consume([{ ...dmg(1, 0), kind: SimEventKind.moved }]);
    expect(log).toEqual([]);
  });
  it('reduced motion keeps the flash but drops particles and shake', () => {
    const { sink, log } = recorder();
    new EventFx(sink, { reducedMotion: () => true }).consume([dmg(1, 0)]);
    expect(log).toEqual(['flash3:ff3a3a', 'spark3']);
  });
  it('scales the shake by damage: harder hits shake longer and stronger, capped', () => {
    const shakeOf = (amount: number): number[] => {
      const { sink, log } = recorder();
      new EventFx(sink, { reducedMotion: () => false }).consume([{ ...dmg(1, 0), amount }]);
      const m = /shake(\d+)@([\d.]+)/.exec(log.join(' '));
      return [Number(m?.[1]), Number(m?.[2])];
    };
    expect(shakeOf(5)).toEqual([80, 0.002]);
    const [d2 = 0, i2 = 0] = shakeOf(2);
    const [d10 = 0, i10 = 0] = shakeOf(10);
    expect(d10).toBeGreaterThan(d2);
    expect(i10).toBeGreaterThan(i2);
    expect(shakeOf(500)).toEqual([120, 0.006]);
    expect(shakeOf(0)[0]).toBeLessThan(80);
  });
});

describe('EventFx, Arcade (FUN-DESIGN section 3)', () => {
  it('drives a hit from hitConfirmed: element flash, number, sparks by strength; the paired damage is skipped', () => {
    for (const strength of [0, 1, 2, 3]) {
      const { sink, log } = recorder();
      arcadeFx(sink).consume([dmg(1, 0), confirmed(1, strength)]);
      const fire = ELEMENT_COLORS.fire.toString(16);
      // A super hit (3) gets the big gold superHit number only, never the small white one on top (qa-r18).
      expect(log).toEqual([`flash3:${fire}`, ...(strength === 3 ? [] : ['number3=12']), `burst3x${String(SPARKS_BY_STRENGTH[strength])}:${fire}`]);
    }
  });
  it('tags scaled and counter hits and falls back to the void colour for an unknown attacker', () => {
    const { sink, log } = recorder();
    arcadeFx(sink).consume([confirmed(1, 0, { scalePm: 900, counter: 1, attacker: 7 })]);
    expect(log.slice(0, 2)).toEqual([`flash3:${ELEMENT_COLORS.void.toString(16)}`, 'number3=12sc']);
  });
  it('the hit-stop jitters the victim until the freeze deadline and shakes by strength (light a small nudge, KO strongest)', () => {
    const shakes = SHAKE_BY_STRENGTH.map((s, i) => (s ? [`shake${String(s[0])}@${String(s[1] * shakeBoost(i))}`] : []));
    for (const strength of [0, 1, 2, 3]) {
      const { sink, log } = recorder();
      arcadeFx(sink).consume([confirmed(10, strength), stop(10, 6)]);
      expect(log.slice(strength === 3 ? 2 : 3)).toEqual(['jitter3<17', ...(shakes[strength] ?? [])]);
    }
    const { sink, log } = recorder();
    arcadeFx(sink).consume([confirmed(10, 0), stop(10, 30, 3)]);
    expect(log.slice(3)).toEqual(['jitter3<41', `shake${String(KO_SHAKE[0])}@${String(KO_SHAKE[1])}`]);
  });
  it('a KO stop punches the camera in, but not under reduced motion and not for an ordinary hit', () => {
    for (const reduced of [false, true]) {
      const { sink } = recorder();
      let punches = 0;
      sink.koPunch = () => { punches++; };
      const fx = arcadeFx(sink, reduced);
      fx.consume([confirmed(10, 0), stop(10, 30, 3), confirmed(60, 3), stop(60, 6)]);
      expect(punches).toBe(reduced ? 0 : 1);
    }
  });
  it('a KO stop washes the screen and rings the victim; heavy hits ring, light ones and reduced motion do not', () => {
    for (const reduced of [false, true]) {
      const { sink } = recorder();
      const calls: string[] = [];
      sink.koWash = () => { calls.push('wash'); };
      sink.ring = (t, _c, w) => { calls.push(`ring${String(t)}w${String(w)}`); };
      arcadeFx(sink, reduced).consume([confirmed(10, 1), stop(10, 6), confirmed(20, 2), stop(20, 6), confirmed(30, 0), stop(30, 30, 3)]);
      expect(calls).toEqual(reduced ? [] : ['ring3w2', 'wash', 'ring3w4']);
    }
  });
  it('does not jitter on a stop that no hit of the same tick and source explains', () => {
    const { sink, log } = recorder();
    arcadeFx(sink).consume([confirmed(10, 1), { ...stop(11, 6), sourceId: 4 }]);
    expect(log.some((l) => l.startsWith('jitter'))).toBe(false);
  });
  it('the super freeze (cause 2, the caster as source) starts the cinematic until its deadline, once, with no shake', () => {
    const { sink, log } = recorder();
    const fx = arcadeFx(sink);
    const freeze = { ...stop(20, 40, 2), sourceId: 0 };
    // A heavy hit earlier in the same tick must not lend its shake (or jitter) to the super freeze.
    fx.consume([confirmed(20, 2), freeze]);
    fx.consume([freeze]);
    expect(log.slice(3)).toEqual(['super0@20<61']);
    const reduced = recorder();
    arcadeFx(reduced.sink, true).consume([freeze]);
    expect(reduced.log).toEqual(['super0@20<61r']);
  });
  it('heavy hits ask for a view-only wash hold, light hits and reduced motion do not', () => {
    const holdOf = (strength: number, reduced = false): number[] => {
      const { sink, holds } = recorder();
      arcadeFx(sink, reduced).consume([confirmed(10, strength)]);
      return holds;
    };
    expect([0, 1, 2, 3].map((st) => holdOf(st)[0])).toEqual([0, 0, 2, 4]);
    expect(holdOf(3, true)).toEqual([0]);
  });
  it('an unpaired stop neither jitters nor shakes with an earlier hit strength', () => {
    const { sink, log } = recorder();
    arcadeFx(sink).consume([confirmed(10, 3), { ...stop(11, 6), sourceId: 4 }]);
    expect(log.slice(3)).toEqual([]);
  });
  it('reduced motion drops motion only: one static spark, no particles, shake or jitter; flash and number stay', () => {
    const { sink, log } = recorder();
    arcadeFx(sink, true).consume([confirmed(10, 2), stop(10, 30, 3)]);
    expect(log).toEqual([`flash3:${ELEMENT_COLORS.fire.toString(16)}`, 'number3=12', 'spark3']);
  });
});

/** Runs a real Arcade match (a scripted opening, then random bots) and returns every event. */
function arcadeEvents(p1: readonly string[], p2: readonly string[]): SimEvent[] {
  const roster = (ids: readonly string[]): { character: ReturnType<typeof characterId>; xp: number }[] =>
    ids.map((id) => ({ character: characterId(id), xp: 0 }));
  const world = createMatch({
    simVersion: SIM_VERSION, seed: 4, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: roster(p1), p2: roster(p2),
  });
  const s = world.state;
  s.x[0] = 400; s.y[0] = 300; s.dir[0] = 0;
  s.x[2] = 600; s.y[2] = 300; s.dir[2] = 4;
  const events: SimEvent[] = [];
  for (let t = 0; t < 200; t++) events.push(...step(world, [Cmd.primary, 0]));
  const bots = [new RandomBot('p1'), new RandomBot('p2')] as const;
  for (let t = 0; t < 3000 && !events.some((e) => e.kind === SimEventKind.matchEnded); t++) {
    events.push(...step(world, collectCommands(world, bots)));
  }
  return events;
}

describe('feedback coverage (FUN-DESIGN section 4): every hitConfirmed gets a flash, a spark and a sound', () => {
  const matches = [
    arcadeEvents(['sindarosa', 'curomo'], ['pax', 'wispera']),
    arcadeEvents(['rokcore', 'wispera'], ['cyclonius', 'curomo']),
    arcadeEvents(['morblass', 'treenoc'], ['sindarosa', 'fiara']),
  ];

  it('the matches land light, medium and heavy hits', () => {
    const hits = matches.flat().filter((e) => e.kind === SimEventKind.hitConfirmed);
    expect(hits.length).toBeGreaterThan(10);
    // Light, medium and heavy at least (best-of-3 matches run long enough for a chord super, strength 3, too).
    expect([...new Set(hits.map((h) => h.strength))]).toEqual(expect.arrayContaining([0, 1, 2]));
  });

  for (const [m, events] of matches.entries()) for (const reduced of [false, true]) {
    const hits = events.filter((e) => e.kind === SimEventKind.hitConfirmed);
    it(`covers 100% of hits in match ${String(m + 1)}${reduced ? ' with reduced motion' : ''}`, () => {
      const { sink, log } = recorder();
      const fx = arcadeFx(sink, reduced);
      let covered = 0;
      for (const h of hits) {
        log.length = 0;
        fx.consume(events.filter((e) => e.tick === h.tick && e.sourceId === h.sourceId));
        const target = String(h.target);
        const sound = events.some((e) => e.tick === h.tick && e.sourceId === h.sourceId && e.kind === SimEventKind.damage
          && e.target === h.target && cueFor(e) !== undefined);
        const flash = log.some((l) => l.startsWith(`flash${target}:`));
        const spark = log.some((l) => l.startsWith(reduced ? `spark${target}` : `burst${target}x`));
        if (flash && spark && sound) covered++;
        // Delivered again (replay or a re-render): nothing fires twice.
        log.length = 0;
        fx.consume([h]);
        expect(log).toEqual([]);
      }
      expect(covered).toBe(hits.length);
    });
  }
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
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((d) => rotationForDir(d, 'fireball'))).toEqual([0, 315, 270, 225, 180, 135, 90, 45]);
    expect(rotationForDir(2, 'tornado')).toBe(0);
  });
});

describe('super hit impact', () => {
  const superFx = (sink: FxSink, reduced = false): EventFx =>
    new EventFx(sink, { reducedMotion: () => reduced, arcade: true, elementOf: (id) => (id === 1 ? 'fire' : undefined), maxLifeOf: () => 400 });

  it('sizes the number by the life share, flashes once per super and adds gold sparks; a normal hit gets none', () => {
    const { sink, supers } = recorder();
    const fx = superFx(sink);
    fx.consume([confirmed(10, 3, { amount: 120 }), confirmed(16, 3, { amount: 120 }), confirmed(80, 3, { amount: 100 }), confirmed(90, 2)]);
    expect(supers.filter((l) => l.startsWith('superHit'))).toEqual(['superHit3=120@0.30F', 'superHit3=120@0.30', 'superHit3=100@0.25F']);
    expect(supers.filter((l) => l.includes(':d9b24c'))).toHaveLength(3);
  });

  it('draws exactly one number per super hit: the gold one, no small white number over it (qa-r18)', () => {
    const { sink, log, supers } = recorder();
    superFx(sink).consume([confirmed(10, 3, { amount: 120 }), confirmed(90, 2, { amount: 30 })]);
    expect(log.filter((l) => l.startsWith('number'))).toEqual(['number3=30']);
    expect(supers.filter((l) => l.startsWith('superHit'))).toHaveLength(1);
  });

  it('keeps the still number but drops the flash and the extra sparks under reduced motion', () => {
    const { sink, supers } = recorder();
    superFx(sink, true).consume([confirmed(10, 3, { amount: 120 })]);
    expect(supers).toContain('superHit3=120@0.30r');
    expect(supers.some((l) => l.includes(':d9b24c'))).toBe(false);
  });
});

describe('EventFx spin (Hurricane) repeat pulses', () => {
  const HURRICANE = ALL_ABILITIES.findIndex((a) => a.id === 'hurricane');
  const pulse = (tick: number, seq: number, extra: Record<string, number> = {}): SimEvent[] => [
    confirmed(tick, 1, { ability: HURRICANE, seq, ...extra }),
    { ...stop(tick, 2), seq: seq + 1000 },
  ];
  const run = (reduced: boolean, evs: SimEvent[][]): string[][] => {
    const { sink, log } = recorder();
    sink.ring = (t, _c, w) => log.push(`ring${String(t)}w${String(w)}`);
    const fx = arcadeFx(sink, reduced);
    return evs.map((e) => {
      log.length = 0;
      fx.consume(e);
      return [...log];
    });
  };

  it('keeps the full effect on pulse 1 and softens pulses 2..6', () => {
    const out = run(false, [0, 1, 2, 3, 4, 5].map((i) => pulse(10 + i * 25, i + 1)));
    expect(out[0]?.some((l) => l.startsWith('flash'))).toBe(true);
    expect(out[0]?.some((l) => l.startsWith('shake'))).toBe(true);
    for (const o of out.slice(1)) {
      expect(o.some((l) => l.startsWith('flash') || l.startsWith('shake') || l.startsWith('jitter'))).toBe(false);
      expect(o.some((l) => l.startsWith('ring'))).toBe(true);
      expect(o.some((l) => l.startsWith('number'))).toBe(true);
    }
  });

  it('restores the full effect once the window expires', () => {
    const out = run(false, [pulse(10, 1), pulse(10 + SPIN_REPEAT_WINDOW_TICKS + 1, 2)]);
    expect(out[1]?.some((l) => l.startsWith('flash'))).toBe(true);
    expect(out[1]?.some((l) => l.startsWith('shake'))).toBe(true);
  });

  it('tracks attackers separately', () => {
    const out = run(false, [pulse(10, 1), pulse(35, 2, { attacker: 2 })]);
    expect(out[1]?.some((l) => l.startsWith('flash'))).toBe(true);
  });

  it('leaves other abilities unchanged', () => {
    const plain = confirmed(10, 1, { ability: 0 });
    const again = confirmed(20, 1, { ability: 0, seq: 2 });
    const out = run(false, [[plain, stop(10, 2)], [again, { ...stop(20, 2), seq: 9 }]]);
    expect(out[1]?.some((l) => l.startsWith('flash'))).toBe(true);
    expect(out[1]?.some((l) => l.startsWith('shake'))).toBe(true);
  });

  it('under reduced motion pulses 2.. drop the flash and shake and keep a number and one spark', () => {
    const out = run(true, [pulse(10, 1), pulse(35, 2)]);
    expect(out[1]?.some((l) => l.startsWith('flash') || l.startsWith('shake'))).toBe(false);
    expect(out[1]).toEqual(expect.arrayContaining(['number3=12', 'spark3']));
  });
});

describe('EventFx tte:sim-event bridge (how-to-play lesson)', () => {
  const started = (tick: number): SimEvent => ({ tick, sourceId: 0, kind: SimEventKind.superStarted, seq: 0, caster: 0, superId: 1 });
  const bridged = (events: SimEvent[]): unknown[] => {
    const host = globalThis as { dispatchEvent?: unknown };
    const prev = host.dispatchEvent;
    const seen: unknown[] = [];
    host.dispatchEvent = (e: { detail: unknown }) => (seen.push(e.detail), true);
    try {
      arcadeFx(recorder().sink).consume(events);
    } finally {
      host.dispatchEvent = prev;
    }
    return seen;
  };
  it('announces each confirmed hit and each super once, ignoring duplicates', () => {
    expect(bridged([confirmed(5, 1, { ability: 7 }), confirmed(5, 1, { ability: 7 }), started(9), started(9)])).toEqual([
      { kind: 'hit', ability: 7, strength: 1, amount: 12, attacker: 1, target: 3 },
      { kind: 'super', caster: 0 },
    ]);
  });
  it('stays quiet for other events', () => {
    expect(bridged([dmg(1, 1)])).toEqual([]);
  });
});
