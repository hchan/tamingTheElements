import { describe, expect, it } from 'vitest';
import {
  Cmd, DEFAULT_SIM_FLAGS, RandomBot, SIM_VERSION, SimEventKind, characterId, collectCommands, createMatch, step,
  type SimEvent,
} from '@core/index';
import { cueFor } from '../audio/sound-map';
import {
  CLASSIC_HIT_TINT, CosmeticRng, ELEMENT_COLORS, EventDeduper, EventFx, HIT_PARTICLES, KO_SHAKE, SHAKE_BY_STRENGTH,
  SPARKS_BY_STRENGTH, type FxSink,
} from './event-fx';
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
function recorder(): { sink: FxSink; log: string[] } {
  const log: string[] = [];
  return {
    log,
    sink: {
      flash: (t, tint) => log.push(`flash${String(t)}:${tint.toString(16)}`),
      burst: (t, o, n, c) => {
        for (let i = 0; i < n * 2; i++) expect(Math.abs(o[i] ?? 9)).toBeLessThanOrEqual(1);
        log.push(`burst${String(t)}x${String(n)}:${c.toString(16)}`);
      },
      spark: (t) => log.push(`spark${String(t)}`),
      shake: (ms, i) => log.push(`shake${String(ms)}@${String(i)}`),
      jitter: (t, until) => log.push(`jitter${String(t)}<${String(until)}`),
      number: (t, a, scaled, counter) => log.push(`number${String(t)}=${String(a)}${scaled ? 's' : ''}${counter ? 'c' : ''}`),
      superCut: (c, from, until, reduced) => log.push(`super${String(c)}@${String(from)}<${String(until)}${reduced ? 'r' : ''}`),
    },
  };
}

const arcadeFx = (sink: FxSink, reduced = false): EventFx =>
  new EventFx(sink, { reducedMotion: () => reduced, arcade: true, elementOf: (id) => (id === 1 ? 'fire' : undefined) });

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
    expect(log).toEqual(['flash3:ff7777']);
  });
});

describe('EventFx, Arcade (FUN-DESIGN section 3)', () => {
  it('drives a hit from hitConfirmed: element flash, number, sparks by strength; the paired damage is skipped', () => {
    for (const strength of [0, 1, 2, 3]) {
      const { sink, log } = recorder();
      arcadeFx(sink).consume([dmg(1, 0), confirmed(1, strength)]);
      const fire = ELEMENT_COLORS.fire.toString(16);
      expect(log).toEqual([`flash3:${fire}`, 'number3=12', `burst3x${String(SPARKS_BY_STRENGTH[strength])}:${fire}`]);
    }
  });
  it('tags scaled and counter hits and falls back to the void colour for an unknown attacker', () => {
    const { sink, log } = recorder();
    arcadeFx(sink).consume([confirmed(1, 0, { scalePm: 900, counter: 1, attacker: 7 })]);
    expect(log.slice(0, 2)).toEqual([`flash3:${ELEMENT_COLORS.void.toString(16)}`, 'number3=12sc']);
  });
  it('the hit-stop jitters the victim until the freeze deadline and shakes by strength (light none, KO strongest)', () => {
    const shakes = SHAKE_BY_STRENGTH.map((s) => (s ? [`shake${String(s[0])}@${String(s[1])}`] : []));
    for (const strength of [0, 1, 2, 3]) {
      const { sink, log } = recorder();
      arcadeFx(sink).consume([confirmed(10, strength), stop(10, 6)]);
      expect(log.slice(3)).toEqual(['jitter3<17', ...(shakes[strength] ?? [])]);
    }
    const { sink, log } = recorder();
    arcadeFx(sink).consume([confirmed(10, 0), stop(10, 30, 3)]);
    expect(log.slice(3)).toEqual(['jitter3<41', `shake${String(KO_SHAKE[0])}@${String(KO_SHAKE[1])}`]);
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
  it('an unpaired stop neither jitters nor shakes with an earlier hit strength', () => {
    const { sink, log } = recorder();
    arcadeFx(sink).consume([confirmed(10, 3), { ...stop(11, 6), sourceId: 4 }]);
    expect(log.slice(3)).toEqual([]);
  });
  it('reduced motion drops motion only: one static spark, no particles, shake or jitter; flash and number stay', () => {
    const { sink, log } = recorder();
    arcadeFx(sink, true).consume([confirmed(10, 3), stop(10, 30, 3)]);
    expect(log).toEqual([`flash3:${ELEMENT_COLORS.fire.toString(16)}`, 'number3=12', 'spark3']);
  });
});

/** Runs a real Arcade match (a scripted opening, then random bots) and returns every event. */
function arcadeEvents(p1: readonly string[], p2: readonly string[]): SimEvent[] {
  const roster = (ids: readonly string[]): { character: ReturnType<typeof characterId>; xp: number }[] =>
    ids.map((id) => ({ character: characterId(id), xp: 0 }));
  const world = createMatch({
    simVersion: SIM_VERSION, seed: 3, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
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
  ];

  it('the matches land light, medium and heavy hits', () => {
    const hits = matches.flat().filter((e) => e.kind === SimEventKind.hitConfirmed);
    expect(hits.length).toBeGreaterThan(10);
    expect(new Set(hits.map((h) => h.strength))).toEqual(new Set([0, 1, 2]));
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
    expect([0, 2, 4, 6, 7].map((d) => rotationForDir(d, 'fireball'))).toEqual([0, 90, 180, 270, 315]);
    expect(rotationForDir(2, 'tornado')).toBe(0);
  });
});
