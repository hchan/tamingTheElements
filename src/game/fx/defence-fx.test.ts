import { describe, expect, it } from 'vitest';
import {
  CHARGE_TICKS, Cmd, ChargeEnd, DASH_TICKS, DEFAULT_SIM_FLAGS, SIM_VERSION, SimEventKind, characterId, createMatch, step, type SimEvent,
} from '@core/index';
import {
  AFTERIMAGE_ALPHA, AFTERIMAGE_FADE, BREAK_COLOR, BREAK_WORD, CHARGE_WORD, CHIP_SPARKS, DODGE_COLOR, DODGE_WORD, DefenceFx, GUARD_COLOR,
  LINES, PARRY_COLOR, PARRY_WORD, REFLECT_SPARKS, SHARD_TICKS, SHATTER_SHARDS, SPARK_TICKS, ghostAlpha, guardFill, popAlpha,
  popRise, progress, ringRadius, type DefenceSink,
} from './defence-fx';

const hex = (c: number): string => c.toString(16);
const ev = (kind: number, tick: number, seq: number, sourceId: number, payload: Record<string, number> = {}): SimEvent =>
  ({ tick, sourceId, kind: kind as SimEvent['kind'], seq, ...payload });

/** Fake sink: one log line per call, so tests read like the effect sequence. */
function recorder(): { sink: DefenceSink; log: string[] } {
  const log: string[] = [];
  return {
    log,
    sink: {
      ghosts: (id, from, until) => log.push(`ghosts${String(id)}@${String(from)}<${String(until)}`),
      sparks: (id, n, c, ticks, reduced) => log.push(`sparks${String(id)}x${String(n)}:${hex(c)}/${String(ticks)}${reduced ? 'r' : ''}`),
      ring: (id, c, reduced) => log.push(`ring${String(id)}:${hex(c)}${reduced ? 'r' : ''}`),
      flash: (id) => log.push(`flash${String(id)}`),
      pop: (id, word, c, reduced) => log.push(`pop${String(id)}:${word}:${hex(c)}${reduced ? 'r' : ''}`),
      say: (line) => log.push(`say:${line.text}`),
    },
  };
}

/** Fighter 0 is the player's (team 0), fighter 1 the enemy's. */
const fx = (sink: DefenceSink, reduced = false): DefenceFx => new DefenceFx(sink, { reducedMotion: () => reduced, teamOf: (id) => id });

describe('DefenceFx: one effect set per defence event (FUN-DESIGN 2.7, 2.8, section 3)', () => {
  it('a dash leaves afterimages for its 12 ticks; a perfect dodge rings and pops DODGE', () => {
    const { sink, log } = recorder();
    fx(sink).consume([ev(SimEventKind.dashed, 100, 0, 0, { dir: 0 }), ev(SimEventKind.perfectDodge, 104, 0, 0, { projectile: 9 })]);
    expect(log).toEqual([`ghosts0@100<${String(100 + DASH_TICKS)}`, `ring0:${hex(DODGE_COLOR)}`, `pop0:${DODGE_WORD}:${hex(DODGE_COLOR)}`]);
  });
  it('a charge leaves speed-line afterimages for its 12 ticks, calls CHARGE! and speaks; its end adds nothing (the arrival hit sparks itself)', () => {
    const { sink, log } = recorder();
    const f = fx(sink);
    f.consume([ev(SimEventKind.chargeStarted, 50, 0, 1, { dir: 4 }), ev(SimEventKind.chargeEnded, 55, 0, 1, { reason: ChargeEnd.arrived })]);
    expect(log).toEqual([`ghosts1@50<${String(50 + CHARGE_TICKS)}`, `pop1:${CHARGE_WORD}:${hex(BREAK_COLOR)}`, `say:The enemy charged.`]);
  });
  it('a charge in reduced motion drops the afterimages; the word and line stay', () => {
    const { sink, log } = recorder();
    fx(sink, true).consume([ev(SimEventKind.chargeStarted, 5, 0, 0, { dir: 0 })]);
    expect(log).toEqual([`pop0:${CHARGE_WORD}:${hex(BREAK_COLOR)}r`, `say:You charged.`]);
  });
  it('a guarded hit throws chip sparks off the target in the guard colour', () => {
    const { sink, log } = recorder();
    fx(sink).consume([ev(SimEventKind.guarded, 10, 3, 9, { target: 1, attacker: 0, chip: 10 })]);
    expect(log).toEqual([`sparks1x${String(CHIP_SPARKS)}:${hex(GUARD_COLOR)}/${String(SPARK_TICKS)}`]);
  });
  it('a parry flashes, pings, pops PARRY, sparks the reflected projectile and speaks for the player or the enemy', () => {
    const { sink, log } = recorder();
    const f = fx(sink);
    f.consume([ev(SimEventKind.parried, 10, 0, 9, { target: 0, attacker: 1, reflected: 1 })]);
    expect(log).toEqual([
      'flash0', `ring0:${hex(PARRY_COLOR)}`, `pop0:${PARRY_WORD}:${hex(PARRY_COLOR)}`,
      `sparks9x${String(REFLECT_SPARKS)}:${hex(PARRY_COLOR)}/${String(SPARK_TICKS)}`, `say:${LINES.parryMine.text}`,
    ]);
    log.length = 0;
    f.consume([ev(SimEventKind.parried, 11, 0, 0, { target: 1, attacker: 0, reflected: 0 })]);
    expect(log).toEqual(['flash1', `ring1:${hex(PARRY_COLOR)}`, `pop1:${PARRY_WORD}:${hex(PARRY_COLOR)}`, `say:${LINES.parryFoe.text}`]);
  });
  it('a guard break shatters the shield, rings, pops GUARD BREAK and speaks', () => {
    const { sink, log } = recorder();
    const f = fx(sink);
    f.consume([ev(SimEventKind.guardBroken, 10, 1, 9, { target: 0 }), ev(SimEventKind.guardBroken, 30, 1, 9, { target: 1 })]);
    const shatter = (id: number): string[] => [
      `sparks${String(id)}x${String(SHATTER_SHARDS)}:${hex(GUARD_COLOR)}/${String(SHARD_TICKS)}`, `ring${String(id)}:${hex(BREAK_COLOR)}`,
      `pop${String(id)}:${BREAK_WORD}:${hex(BREAK_COLOR)}`,
    ];
    expect(log).toEqual([...shatter(0), `say:${LINES.breakMine.text}`, ...shatter(1), `say:${LINES.breakFoe.text}`]);
    // Polite lines (through the throttle): a break or a parry never interrupts the match-end line.
    expect(Object.values(LINES).map((l) => l.important)).toEqual([false, false, false, false]);
  });
  it('reduced motion drops motion only: no afterimages, one static spark, static rings and pops; flash and lines stay', () => {
    const { sink, log } = recorder();
    fx(sink, true).consume([
      ev(SimEventKind.dashed, 1, 0, 0), ev(SimEventKind.perfectDodge, 2, 0, 0), ev(SimEventKind.guarded, 3, 0, 9, { target: 0 }),
      ev(SimEventKind.parried, 4, 0, 9, { target: 0, reflected: 1 }), ev(SimEventKind.guardBroken, 5, 0, 9, { target: 0 }),
    ]);
    expect(log).toEqual([
      `ring0:${hex(DODGE_COLOR)}r`, `pop0:${DODGE_WORD}:${hex(DODGE_COLOR)}r`,
      `sparks0x1:${hex(GUARD_COLOR)}/${String(SPARK_TICKS)}r`,
      'flash0', `ring0:${hex(PARRY_COLOR)}r`, `pop0:${PARRY_WORD}:${hex(PARRY_COLOR)}r`, `sparks9x1:${hex(PARRY_COLOR)}/${String(SPARK_TICKS)}r`,
      `say:${LINES.parryMine.text}`,
      `sparks0x1:${hex(GUARD_COLOR)}/${String(SHARD_TICKS)}r`, `ring0:${hex(BREAK_COLOR)}r`, `pop0:${BREAK_WORD}:${hex(BREAK_COLOR)}r`,
      `say:${LINES.breakMine.text}`,
    ]);
  });
  it('fires once per event: a re-delivered batch or an older event is skipped; other kinds are ignored', () => {
    const { sink, log } = recorder();
    const f = fx(sink);
    const batch = [ev(SimEventKind.guarded, 5, 1, 9, { target: 1 }), ev(SimEventKind.guarded, 5, 2, 9, { target: 1 })];
    f.consume(batch);
    f.consume(batch);
    f.consume([ev(SimEventKind.guarded, 4, 9, 9, { target: 1 }), ev(SimEventKind.hitConfirmed, 6, 0, 9), ev(SimEventKind.recovered, 6, 1, 9)]);
    expect(log).toHaveLength(2);
    f.consume([ev(SimEventKind.guarded, 5, 3, 9, { target: 1 }), ev(SimEventKind.guarded, 6, 0, 9, { target: 1 })]);
    expect(log).toHaveLength(4);
  });
});

describe('defence timing and geometry', () => {
  it('progress clamps to 0..1', () => {
    expect(progress(5, 10, 4)).toBe(0);
    expect(progress(12, 10, 4)).toBe(0.5);
    expect(progress(20, 10, 4)).toBe(1);
  });
  it('the ping grows from half to 1.4x the fighter size; reduced motion holds a static ring', () => {
    expect(ringRadius(0, 40, false)).toBe(20);
    expect(ringRadius(1, 40, false)).toBeCloseTo(56);
    expect(ringRadius(0, 40, true)).toBe(40);
    expect(ringRadius(0.7, 40, true)).toBe(40);
  });
  it('pops rise 24 px and fade over their last third; reduced motion does not rise', () => {
    expect(popRise(0, false)).toBe(0);
    expect(popRise(1, false)).toBe(24);
    expect(popRise(1, true)).toBe(0);
    expect(popAlpha(0.5)).toBe(1);
    expect(popAlpha(1)).toBe(0);
  });
  it('afterimages keep 0.5 / 0.3 / 0.15 during the dash and fade out after it', () => {
    expect(AFTERIMAGE_ALPHA).toEqual([0.5, 0.3, 0.15]);
    expect([0, 1, 2].map((k) => ghostAlpha(k, 105, 112))).toEqual([0.5, 0.3, 0.15]);
    expect(ghostAlpha(0, 112 + AFTERIMAGE_FADE / 2, 112)).toBeCloseTo(0.25);
    expect(ghostAlpha(0, 112 + AFTERIMAGE_FADE, 112)).toBe(0);
    expect(ghostAlpha(3, 100, 112)).toBe(0);
  });
  it('the guard bar fill is proportional and clamped', () => {
    expect(guardFill(1000, 1000, 64)).toBe(64);
    expect(guardFill(500, 1000, 64)).toBe(32);
    expect(guardFill(-5, 1000, 64)).toBe(0);
    expect(guardFill(2000, 1000, 64)).toBe(64);
  });
});

describe('feedback coverage: every defence event of a real Arcade duel gets an effect', () => {
  const INTRO = 91;
  /** Pax (team 0) against Sindarosa (team 1), who fires Fire Blast whenever it can; team 0 plays `p0(t)` from the fight. */
  function duel(p0: (t: number) => number, ticks: number): SimEvent[] {
    const world = createMatch({
      simVersion: SIM_VERSION, seed: 3, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
      p1: [{ character: characterId('pax'), xp: 1 }], p2: [{ character: characterId('sindarosa'), xp: 1 }],
    });
    const out: SimEvent[] = [];
    for (let t = 0; t < INTRO + ticks; t++) out.push(...step(world, t < INTRO ? [0, 0] : [p0(t - INTRO), Cmd.primary]));
    return out;
  }
  const scenarios = {
    'guard held until it breaks': duel(() => Cmd.guard, 1500),
    'guard pressed as each shot arrives': duel((t) => (t % 31 === 0 ? Cmd.guard : 0), 300),
    // 400 ticks: a heavy hit stuns 44 since WP-arcade-numbers, so early dashes are lost to stun; a later one dodges.
    'dash into each shot': duel((t) => (t % 31 === 0 ? Cmd.dash | Cmd.right : 0), 400),
  };
  const all = Object.values(scenarios).flat();
  const kinds = [SimEventKind.guarded, SimEventKind.parried, SimEventKind.guardBroken, SimEventKind.dashed, SimEventKind.perfectDodge];

  it('the duels produce every defence event', () => {
    for (const k of kinds) expect(all.some((e) => e.kind === k), String(k)).toBe(true);
  });
  for (const reduced of [false, true]) {
    for (const [name, events] of Object.entries(scenarios)) {
      it(`${name}: 100% of defence events give a visual effect${reduced ? ' with reduced motion (but the dash)' : ''}`, () => {
        let calls = 0;
        const count = (): void => { calls++; };
        const f = new DefenceFx(
          { ghosts: count, sparks: count, ring: count, flash: count, pop: count, say: () => undefined },
          { reducedMotion: () => reduced, teamOf: () => 0 },
        );
        const byTick = new Map<number, SimEvent[]>();
        for (const e of events) byTick.set(e.tick, [...(byTick.get(e.tick) ?? []), e]);
        for (const batch of byTick.values()) {
          for (const e of batch) {
            if (!kinds.includes(e.kind as (typeof kinds)[number])) continue;
            const before = calls;
            f.consume([e]);
            // Reduced motion: the dash's own movement is its cue (afterimages are motion only).
            const want = reduced && e.kind === SimEventKind.dashed ? 0 : 1;
            expect(calls - before, `kind ${String(e.kind)} at ${String(e.tick)}`).toBeGreaterThanOrEqual(want);
          }
        }
      });
    }
  }
});
