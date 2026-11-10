import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Cmd } from '../../src/core/sim/commands';
import { SimEventKind, type SimEvent } from '../../src/core/sim/events';
import { createMatch } from '../../src/core/sim/match';
import { cooldownIdx } from '../../src/core/sim/state';
import { step } from '../../src/core/sim/step';
import { controlledId } from '../../src/core/sim/systems/movement';
import { rleDecode } from '../../src/core/replay/rle';
import { parseReplay, serializeReplay, setupFromHeader } from '../../src/core/replay/format';
import { arcadeScripts, recordArcadeScript } from '../../tools/gen/arcade-moves';

// Coverage by events: the scripted Arcade goldens (tools/gen/arcade-moves.ts) exist to put every Arcade mechanic under
// the hash checkpoints. This replays them and asserts from the event stream that each mechanic still fires, so a sim
// change that makes a script miss (a blast that no longer lands, a parry window that moved) fails here by name instead
// of leaving a golden that quietly stopped covering it.

const DIR = new URL('../fixtures/replays/', import.meta.url);
const FILES = ['arcade-moves', 'arcade-weather'] as const;
const K = SimEventKind;

interface Run {
  readonly events: SimEvent[];
  /** Casts that ran on a tick whose raw command did not hold the button: the press was buffered. */
  readonly bufferedCasts: number;
  readonly ticks: number;
}

function load(name: string): ReturnType<typeof parseReplay> {
  return parseReplay(readFileSync(new URL(`${name}.replay.json`, DIR), 'utf8'));
}

/** Re-simulates a golden from its recorded inputs, collecting every event and counting buffered casts. */
function run(name: string): Run {
  const replay = load(name);
  const world = createMatch(setupFromHeader(replay.header));
  const [in0, in1] = [rleDecode(replay.inputs[0]), rleDecode(replay.inputs[1])];
  const events: SimEvent[] = [];
  const stamp = new Map<number, number>();
  let bufferedCasts = 0;
  for (let t = 0; t < replay.header.tickCount; t++) {
    const cmds = [in0[t] ?? 0, in1[t] ?? 0] as const;
    events.push(...step(world, cmds));
    for (const team of [0, 1]) {
      const id = controlledId(world, team);
      if (id < 0) continue;
      for (const [slot, bit] of [[0, Cmd.primary], [1, Cmd.secondary]] as const) {
        const key = id * 2 + slot;
        const at = world.state.abil[cooldownIdx(id, slot)] ?? 0;
        // A cast stamps its cooldown into the future; with the button already released, the buffer replayed the press.
        if (at > (stamp.get(key) ?? 0) && ((cmds[team] ?? 0) & bit) === 0) bufferedCasts++;
        stamp.set(key, at);
      }
    }
  }
  return { events, bufferedCasts, ticks: replay.header.tickCount };
}

const runs = FILES.map(run);
const all = runs.flatMap((r) => r.events);
const of = (kind: number, from: readonly SimEvent[] = all): SimEvent[] => from.filter((e) => e.kind === kind);
const moves = runs[0]?.events ?? [];
const weatherRun = runs[1]?.events ?? [];
const hits = of(K.hitConfirmed);

describe('scripted Arcade goldens: every mechanic fires', () => {
  const mechanics: readonly (readonly [string, () => number])[] = [
    ['buffered cast', () => runs.reduce((n, r) => n + r.bufferedCasts, 0)],
    ['combo of 3+ hits with damage scaling', () => hits.filter((e) => (e.combo ?? 0) >= 3 && (e.scalePm ?? 1000) < 1000).length],
    ['combo ended with 3+ hits', () => of(K.comboEnded).filter((e) => (e.hits ?? 0) >= 3).length],
    ['counter hit', () => hits.filter((e) => e.counter === 1).length],
    ['dash', () => of(K.dashed).length],
    ['perfect dodge', () => of(K.perfectDodge).length],
    ['guard with chip', () => of(K.guarded).filter((e) => (e.chip ?? 0) > 0).length],
    ['guard break', () => of(K.guardBroken).length],
    ['parry with projectile reflection', () => of(K.parried).filter((e) => e.reflected === 1).length],
    ['8-way diagonal shot landing', () => hits.filter((e) => e.strength !== 3 && e.dir !== undefined && e.dir % 2 === 1).length],
    ['super cinematic freeze', () => of(K.hitStop).filter((e) => e.cause === 2 && e.ticks === 40).length],
    ['super hits', () => hits.filter((e) => e.strength === 3).length],
    ['super ended', () => of(K.superEnded).length],
    ['clash that destroys both (void against air)', () => of(K.clash).filter((e) => e.winner === -1).length],
    ['clash won by element (fire over air)', () => of(K.clash).filter((e) => e.winner === e.a && e.ea === 0 && e.eb === 1).length],
    ['round KO', () => of(K.ko).length],
    ['time over', () => of(K.timeOver).length],
    ['match ended', () => of(K.matchEnded).length],
  ];

  it.each(mechanics)('%s', (_name, count) => {
    expect(count()).toBeGreaterThan(0);
  });

  it('the super is paid for with a meter the fight built', () => {
    const first = of(K.superStarted)[0];
    expect(first).toBeDefined();
    const built = of(K.meterLevel).filter((e) => e.team === 0 && e.tick < (first?.tick ?? 0));
    expect(built.length).toBeGreaterThan(0);
  });

  it('a KO lands during a super (the KO hit-stop comes from a strength-3 hit, and the super ends with it)', () => {
    const ko = of(K.hitStop).filter((e) => e.cause === 3);
    const finisher = hits.find((e) => e.strength === 3 && ko.some((s) => s.tick === e.tick && s.sourceId === e.sourceId));
    expect(finisher).toBeDefined();
    expect(of(K.superEnded).some((e) => e.tick === finisher?.tick)).toBe(true);
    expect(of(K.died).some((e) => e.tick === finisher?.tick)).toBe(true);
  });

  it('a weather is called for each of the five kinds', () => {
    const kinds = new Set(of(K.weatherChanged).map((e) => e.weather));
    expect([...kinds].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('a hit lands under the eclipse with the weather factor', () => {
    const eclipse = of(K.weatherChanged, weatherRun).find((e) => e.weather === 5);
    const hit = of(K.hitConfirmed, weatherRun).find((e) => e.tick > (eclipse?.tick ?? Infinity));
    expect(eclipse).toBeDefined();
    // chaos bolt: 40 base * 1.1 (level 1) * 1.2 (eclipse favours void) against air at x1.0
    expect(hit?.amount).toBeCloseTo(52.8, 6);
  });

  it('the clash survivor flies on with its damage cut and lands', () => {
    const won = of(K.clash, weatherRun).find((e) => e.winner !== -1);
    if (!won) throw new Error('no clash with a survivor');
    const hit = of(K.hitConfirmed, weatherRun).find((e) => e.sourceId === won.winner && e.tick > won.tick);
    expect(hit).toBeDefined();
  });

  it('the rounds run best of three: a KO win, a time-over loss, a super KO win', () => {
    const rounds = of(K.roundEnded, moves);
    expect(rounds.map((e) => e.winner)).toEqual([0, 1, 0]);
    expect(rounds.map((e) => [e.won0, e.won1])).toEqual([[1, 0], [1, 1], [2, 1]]);
    expect(of(K.roundStarted, moves).map((e) => e.round)).toEqual([1, 2, 3]);
    expect(of(K.matchEnded, moves)[0]).toMatchObject({ winner: 0, won0: 2, won1: 1 });
    const timeOver = of(K.timeOver, moves)[0]?.tick ?? 0;
    const koTicks = of(K.ko, moves).map((e) => e.tick);
    expect(koTicks).toHaveLength(2);
    expect(koTicks[0]).toBeLessThan(timeOver);
    expect(koTicks[1]).toBeGreaterThan(timeOver);
  });

  it('the committed goldens are what the scripts record today', () => {
    for (const script of arcadeScripts()) {
      const committed = readFileSync(new URL(`${script.file}.replay.json`, DIR), 'utf8');
      expect(serializeReplay(recordArcadeScript(script))).toBe(committed);
    }
  });
});
