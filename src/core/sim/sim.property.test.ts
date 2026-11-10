import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { collectCommands, type Agent } from '../agents/agent';
import { RandomBot } from '../agents/random-bot';
import type { ChapterNumber } from '../data/chapters';
import { CHARACTERS } from '../data/characters';
import { ARCADE_CMD_BITS, Cmd, CMD_RESERVED_MASK, inputMaskFor, type Command } from './commands';
import { hash } from './hash';
import { createMatch, type MatchSetup } from './match';
import { restore, snapshot, createSnapshotBuf } from './snapshot';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW, EntityFlag, EntityKind, MAX_ENTITIES, STATUS_SLOTS, STATUS_STRIDE, TEAM_COUNT, TEAM_ACTIVE_COUNTS, TEAM_STRIDE, TeamField, World } from './state';
import { ABILITY_DEFS } from './systems/projectile';
import { hasEnded } from './systems/end';
import { step } from './step';
import { isArcade, isFrozen, now } from './clock';
import {
  COMBO_STUN_CAP_TICKS, HitStopCause, JUGGLE_LIMIT, KO_HIT_STOP_TICKS, METER_BAR, METER_MAX, SUPER_FREEZE_TICKS,
} from '../data/arcade';
import { SUPER_DEF } from './systems/arcade/hit';
import { SimEventKind, type SimEvent } from './events';
import type { SimWorld } from './world';

// Core has no Node types; the tests only read the environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

/** Property runs per test: small for PRs, large when SIM_FUZZ_RUNS is set (nightly). */
const RUNS = Number(process.env['SIM_FUZZ_RUNS'] ?? '') || 25;
const MAX_TICKS = Number(process.env['SIM_FUZZ_TICKS'] ?? '') || 300;
/** Pinned seed in CI so failures reproduce; override with FC_SEED. */
const SEED = Number(process.env['FC_SEED'] ?? '') || 0x7a11;
const FC = { numRuns: RUNS, seed: SEED } as const;
vi.setConfig({ testTimeout: RUNS > 100 ? 900_000 : 20_000 });

const EVENT_BOUND = 64;
const CAPTURE_DEF_INDEX = ABILITY_DEFS.findIndex((d) => d.id === 'capture');

const rosterArb = fc.array(
  fc.record({ character: fc.constantFrom(...CHARACTERS.map((c) => c.id)), xp: fc.integer({ min: 0, max: 400 }) }),
  { minLength: 1, maxLength: 4 },
);

const setupArb: fc.Arbitrary<MatchSetup> = fc.record({
  simVersion: fc.constant(1),
  seed: fc.integer({ min: 0, max: 0xffffffff }),
  flags: fc.record({
    experimentalSpawnCurve: fc.boolean(),
    experimentalPathing: fc.boolean(),
    elementalAdvantage: fc.boolean(),
    testerCapture: fc.constant(false),
    rulesetArcade: fc.boolean(),
  }),
  chapter: fc.constantFrom<ChapterNumber>(1, 2, 3, 4, 5),
  difficulty: fc.constantFrom(0.25, 0.66, 0.85, 1, 1.12, 1.5),
  p1: rosterArb,
  p2: rosterArb,
});

const cmdArb = fc.integer({ min: 0, max: 0xffff });
const cmdsArb = fc.array(fc.tuple(cmdArb, cmdArb), { minLength: 1, maxLength: MAX_TICKS });
/** Held-key style input: long runs of the same command, like a real player. */
const stickyArb = fc
  .array(fc.tuple(fc.integer({ min: 1, max: 40 }), cmdArb, cmdArb), { minLength: 1, maxLength: 20 })
  .map((runs) => runs.flatMap(([n, a, b]) => Array.from({ length: n }, (): [number, number] => [a, b])));
const inputsArb = fc.oneof(cmdsArb, stickyArb);

type Cmds = readonly (readonly [number, number])[];

function aliveCount(w: SimWorld): number {
  let n = 0;
  for (let i = 0; i < MAX_ENTITIES; i++) if (((w.state.flags[i] ?? 0) & EntityFlag.alive) !== 0) n++;
  return n;
}

/** Cooldown-until values of both teams (swap cooldown, then the four ability slots). */
function cooldowns(w: SimWorld): number[] {
  const out: number[] = [];
  for (let t = 0; t < TEAM_COUNT; t++) {
    for (let k = 0; k < 1 + 4; k++) out.push(w.state.teams[t * TEAM_STRIDE + TeamField.swapCooldownUntil + k] ?? 0);
  }
  return out;
}

/** Checks every per-step invariant; throws with a description on the first violation. */
function checkInvariants(w: SimWorld, prevTick: number, events: readonly SimEvent[], wasFrozen: boolean): void {
  const s = w.state;
  const fail = (msg: string): never => {
    throw new Error(`tick ${String(prevTick + 1)}: ${msg}`);
  };
  if ((s.world[World.tick] ?? 0) !== prevTick + 1) fail('tick did not advance by exactly 1');
  for (const name of ['x', 'y', 'px', 'py', 'vx', 'vy', 'w', 'h', 'hp', 'maxHp', 'speed'] as const) {
    for (let i = 0; i < MAX_ENTITIES; i++) {
      if (!Number.isFinite(s[name][i])) fail(`${name}[${String(i)}] is not finite`);
    }
  }
  if (aliveCount(w) > MAX_ENTITIES) fail('too many entities');
  const a = w.arena;
  for (let i = 0; i < MAX_ENTITIES; i++) {
    const f = s.flags[i] ?? 0;
    if ((f & EntityFlag.alive) === 0) continue;
    if (s.kind[i] === EntityKind.character) {
      const hp = s.hp[i] ?? 0;
      if (hp < 0 || hp > (s.maxHp[i] ?? 0)) fail(`hp ${String(hp)} out of [0, ${String(s.maxHp[i])}] for ${String(i)}`);
      if ((f & EntityFlag.dead) !== 0 && hp !== 0) fail(`dead character ${String(i)} has hp ${String(hp)}`);
      if ((f & EntityFlag.dead) === 0 && hp === 0) fail(`character ${String(i)} has hp 0 but is not dead`);
      if ((f & EntityFlag.dead) === 0 && (f & EntityFlag.benched) === 0) {
        const x = s.x[i] ?? 0;
        const y = s.y[i] ?? 0;
        // KNOWN-BUG:bounds-y-typo: legacy never restores y, so only x is held inside the arena.
        if (x < a.x || x + (s.w[i] ?? 0) > a.x + a.w) fail(`character ${String(i)} outside arena in x at ${String(x)}`);
        if (!Number.isFinite(y)) fail(`character ${String(i)} y is not finite`);
      }
    }
    for (let k = 0; k < STATUS_SLOTS; k++) {
      const b = (i * STATUS_SLOTS + k) * STATUS_STRIDE;
      // Status deadlines are in game time (`now`, which stops during Arcade hit-stop).
      if ((s.status[b] ?? 0) !== 0 && (s.status[b + 3] ?? 0) <= now(s) - 1)
        fail(`expired status left on ${String(i)}`);
    }
  }
  const live = new Map<number, number>();
  for (let i = 0; i < MAX_ENTITIES; i++) {
    const kind = s.kind[i];
    // Counted entities: bullets, melee casts and the Capture bullet (an effect); Vines effects are not counted.
    const counted =
      kind === EntityKind.projectile ||
      kind === EntityKind.melee ||
      (kind === EntityKind.effect && s.defId[i] === CAPTURE_DEF_INDEX);
    if (!counted || ((s.flags[i] ?? 0) & EntityFlag.alive) === 0) continue;
    const key = (s.team[i] ?? 0) * 100 + (s.defId[i] ?? 0);
    live.set(key, (live.get(key) ?? 0) + 1);
  }
  for (let t = 0; t < TEAM_COUNT; t++) {
    for (let d = 0; d < ABILITY_DEFS.length; d++) {
      const n = s.teams[t * TEAM_STRIDE + TEAM_ACTIVE_COUNTS + d] ?? 0;
      const def = ABILITY_DEFS[d];
      if (def?.kind === 'omni') {
        // KNOWN-BUG:omni-no-cooldown: omni bullets despawn without ever being counted, so the counter only drifts down.
        if (n > 0) fail(`omni active count ${String(n)} > 0 for team ${String(t)} def ${String(d)}`);
      } else if (n !== (live.get(t * 100 + d) ?? 0)) {
        fail(`active count ${String(n)} != live projectiles for team ${String(t)} def ${String(d)}`);
      } else if (n > (def?.maxActive ?? Infinity)) {
        fail(`active count ${String(n)} > maxActive for team ${String(t)} def ${String(d)}`);
      }
    }
  }
  const seen = new Set<number>();
  let last = -1;
  for (const e of events) {
    if (e.tick !== prevTick) fail(`event tick ${String(e.tick)} != ${String(prevTick)}`);
    if (seen.has(e.seq)) fail(`duplicate event seq ${String(e.seq)}`);
    if (e.seq <= last) fail('event seq not ascending');
    seen.add(e.seq);
    last = e.seq;
  }
  if (events.length > EVENT_BOUND) fail(`${String(events.length)} events in one tick`);
  checkArcade(w, events, wasFrozen, fail);
}

/** Arcade invariants: a frozen step is silent; every hit stops the clock for at most KO_HIT_STOP_TICKS; caps; meter. */
function checkArcade(w: SimWorld, events: readonly SimEvent[], wasFrozen: boolean, fail: (m: string) => never): void {
  const s = w.state;
  if (!isArcade(s)) {
    if (events.some((e) => e.kind >= 40)) fail('Arcade event in Classic');
    return;
  }
  if (wasFrozen && events.length > 0) fail('events while frozen');
  const left = (s.arcade[ARCADE_WORLD_BASE + ArcadeW.freezeUntil] ?? 0) - (s.world[World.tick] ?? 0);
  if (left > Math.max(KO_HIT_STOP_TICKS, SUPER_FREEZE_TICKS)) fail(`freeze of ${String(left)} ticks`);
  const hits = events.filter((e) => e.kind === SimEventKind.hitConfirmed).length;
  const stops = events.filter((e) => e.kind === SimEventKind.hitStop && e['cause'] !== HitStopCause.super).length;
  if (hits !== stops) fail('hit without hit-stop');
  if (hits > 0 && !isFrozen(s)) fail('hit did not freeze');
  // Stun and knockback (FUN-DESIGN 2.3): the caps hold, a stun never outlasts its combo's budget, and walls hold y too.
  const g = now(s);
  for (let i = 0; i < MAX_ENTITIES; i++) {
    const e = i * ARCADE_E;
    const juggle = s.arcade[e + ArcadeE.juggle] ?? 0;
    const total = s.arcade[e + ArcadeE.comboStunTotal] ?? 0;
    if (juggle > JUGGLE_LIMIT || total > COMBO_STUN_CAP_TICKS) fail(`juggle ${String(juggle)}, stun total ${String(total)}`);
    if ((s.arcade[e + ArcadeE.stunUntil] ?? 0) - g > total) fail(`stun of ${String(i)} outlasts its combo budget`);
    const f = s.flags[i] ?? 0;
    if (s.kind[i] !== EntityKind.character || (f & EntityFlag.alive) === 0 || (f & EntityFlag.benched) !== 0) continue;
    const y = s.y[i] ?? 0;
    if (y < w.arena.y || y + (s.h[i] ?? 0) > w.arena.y + w.arena.h) fail(`character ${String(i)} outside arena in y`);
  }
  // Combos (FUN-DESIGN 2.4): the juggle cap bounds a combo at JUGGLE_LIMIT + 2 hits (start, juggles, the capped hit).
  for (let t = 0; t < TEAM_COUNT; t++) {
    const hits = s.arcade[ARCADE_TEAM_BASE + t * ARCADE_T + ArcadeT.comboHits] ?? 0;
    if (hits < 0 || hits > JUGGLE_LIMIT + 2) fail(`team ${String(t)} combo of ${String(hits)} hits`);
  }
  for (const e of events) {
    if (e.kind === SimEventKind.comboEnded && (e['hits'] ?? 0) < 1) fail('empty combo ended');
  }
  // Hyper meter (FUN-DESIGN 2.5): within 0..METER_MAX, and a team's last meterLevel of the tick names its bars.
  for (let t = 0; t < TEAM_COUNT; t++) {
    const meter = s.arcade[ARCADE_TEAM_BASE + t * ARCADE_T + ArcadeT.meter] ?? 0;
    if (meter < 0 || meter > METER_MAX) fail(`team ${String(t)} meter ${String(meter)}`);
    const last = events.filter((e) => e.kind === SimEventKind.meterLevel && e['team'] === t).at(-1);
    if (last && last['bars'] !== Math.floor(meter / METER_BAR)) fail(`meterLevel ${String(last['bars'])} for meter ${String(meter)}`);
  }
  // Supers (FUN-DESIGN 2.5): `superState` names the team's one live super entity, owned by a character of the team.
  for (let t = 0; t < TEAM_COUNT; t++) {
    const fx = (s.arcade[ARCADE_TEAM_BASE + t * ARCADE_T + ArcadeT.superState] ?? 0) - 1;
    let live = 0;
    for (let i = 0; i < MAX_ENTITIES; i++) {
      if (s.kind[i] === EntityKind.effect && s.defId[i] === SUPER_DEF && s.team[i] === t && ((s.flags[i] ?? 0) & EntityFlag.alive) !== 0) live++;
    }
    if (live !== (fx >= 0 ? 1 : 0) || (fx >= 0 && (s.defId[fx] !== SUPER_DEF || s.team[s.owner[fx] ?? 0] !== t)))
      fail(`team ${String(t)} super state ${String(fx)} with ${String(live)} live supers`);
  }
  for (const e of events) {
    if (e.kind === SimEventKind.superStarted && !isFrozen(s)) fail('super did not freeze');
  }
}

function runInputs(
  setup: MatchSetup, inputs: Cmds, check = true, prep?: (w: SimWorld) => void,
): { world: SimWorld; hashes: number[]; events: SimEvent[][] } {
  const world = createMatch(setup);
  prep?.(world);
  const hashes: number[] = [];
  const events: SimEvent[][] = [];
  let prevCd = cooldowns(world);
  for (const [a, b] of inputs) {
    const tick = world.state.world[World.tick] ?? 0;
    const wasFrozen = isFrozen(world.state);
    const ev = step(world, [a, b]);
    if (check) {
      checkInvariants(world, tick, ev, wasFrozen);
      const cd = cooldowns(world);
      cd.forEach((v, i) => {
        // Cooldown deadlines only ever move forward (a new cast sets tick + cooldown).
        if (v < (prevCd[i] ?? 0)) throw new Error(`tick ${String(tick)}: cooldown ${String(i)} went backwards`);
      });
      prevCd = cd;
    }
    hashes.push(hash(world.state));
    events.push([...ev]);
  }
  return { world, hashes, events };
}

describe('sim properties: invariants', () => {
  it('hold under arbitrary command streams', () => {
    fc.assert(
      fc.property(setupArb, inputsArb, (setup, inputs) => {
        runInputs(setup, inputs);
      }),
      FC,
    );
  });

  it('hold under random bots, and the match end is emitted at most once', () => {
    fc.assert(
      fc.property(setupArb, (setup) => {
        const world = createMatch(setup);
        const bots: readonly [Agent, Agent] = [new RandomBot('r0'), new RandomBot('r1')];
        let ended = 0;
        for (let t = 0; t < MAX_TICKS; t++) {
          const tick = world.state.world[World.tick] ?? 0;
          const wasFrozen = isFrozen(world.state);
          const ev = step(world, collectCommands(world, bots));
          checkInvariants(world, tick, ev, wasFrozen);
          ended += ev.filter((e) => e.kind === 30).length;
        }
        expect(ended).toBe(hasEnded(world.state) ? 1 : 0);
      }),
      FC,
    );
  });

  it('never gets stuck: after the match ends, stepping stays finite and silent', () => {
    fc.assert(
      fc.property(setupArb, stickyArb, (setup, inputs) => {
        const { world } = runInputs(setup, inputs);
        if (!hasEnded(world.state)) return;
        for (let i = 0; i < 10; i++) {
          const tick = world.state.world[World.tick] ?? 0;
          const wasFrozen = isFrozen(world.state);
          const ev = step(world, [0, 0]);
          checkInvariants(world, tick, ev, wasFrozen);
          expect(ev.some((e) => e.kind === 30)).toBe(false);
        }
      }),
      FC,
    );
  });

  it('hold in Arcade with full hyper meters: supers start, freeze, run and end exactly once each', () => {
    let supers = 0;
    const full = (w: SimWorld): void => {
      for (let t = 0; t < TEAM_COUNT; t++) w.state.arcade[ARCADE_TEAM_BASE + t * ARCADE_T + ArcadeT.meter] = METER_MAX;
    };
    fc.assert(
      fc.property(setupArb, inputsArb, (setup, inputs) => {
        const arcade = { ...setup, flags: { ...setup.flags, rulesetArcade: true } };
        const { world, events } = runInputs(arcade, inputs, true, full);
        const all = events.flat();
        const started = all.filter((e) => e.kind === SimEventKind.superStarted).length;
        const live = [0, 1].filter((t) => (world.state.arcade[ARCADE_TEAM_BASE + t * ARCADE_T + ArcadeT.superState] ?? 0) !== 0);
        expect(all.filter((e) => e.kind === SimEventKind.superEnded).length).toBe(started - live.length);
        supers += started;
      }),
      FC,
    );
    expect(supers).toBeGreaterThan(0);
  });

  it('ignores command bits outside the ruleset input mask', () => {
    fc.assert(
      fc.property(setupArb, cmdsArb, (setup, inputs) => {
        const m = inputMaskFor(setup.flags);
        const masked = inputs.map(([a, b]): [number, number] => [a & m, b & m]);
        expect(runInputs(setup, inputs, false).hashes).toEqual(runInputs(setup, masked, false).hashes);
      }),
      FC,
    );
  });
});

describe('sim properties: determinism', () => {
  it('same seed and commands give the same hashes and events', () => {
    fc.assert(
      fc.property(setupArb, inputsArb, (setup, inputs) => {
        const a = runInputs(setup, inputs, false);
        const b = runInputs(setup, inputs, false);
        expect(b.hashes).toEqual(a.hashes);
        expect(b.events).toEqual(a.events);
      }),
      FC,
    );
  });

  it('different match seeds start from different states', () => {
    fc.assert(
      fc.property(setupArb, fc.integer({ min: 1, max: 0xffff }), (setup, delta) => {
        const other = { ...setup, seed: (setup.seed + delta) >>> 0 };
        expect(hash(createMatch(other).state)).not.toBe(hash(createMatch(setup).state));
      }),
      FC,
    );
  });

  it('snapshot then restore mid-run does not change the future', () => {
    fc.assert(
      fc.property(setupArb, inputsArb, fc.nat(), fc.integer({ min: 1, max: 8 }), (setup, inputs, at, depth) => {
        const cut = at % inputs.length;
        const world = createMatch(setup);
        const buf = createSnapshotBuf(world.state);
        const tail = inputs.slice(cut, cut + 60);
        for (const [a, b] of inputs.slice(0, cut)) step(world, [a, b]);
        const h0 = hash(world.state);
        snapshot(world.state, buf);
        const first = tail.map(([a, b]) => {
          step(world, [a, b]);
          return hash(world.state);
        });
        restore(world.state, buf);
        expect(hash(world.state)).toBe(h0);
        const again = tail.map(([a, b]) => {
          step(world, [a, b]);
          return hash(world.state);
        });
        expect(again).toEqual(first);

        // Rollback of 1..8 ticks: re-simulating the same inputs reproduces the original hashes.
        const n = Math.min(depth, first.length);
        restore(world.state, buf);
        for (const [a, b] of tail.slice(0, n)) step(world, [a, b]);
        expect(hash(world.state)).toBe(n === 0 ? h0 : first[n - 1]);
      }),
      FC,
    );
  });

  it('a restored copy in a fresh world matches the original', () => {
    fc.assert(
      fc.property(setupArb, inputsArb, (setup, inputs) => {
        const a = createMatch(setup);
        const b = createMatch(setup);
        const half = inputs.length >> 1;
        for (const [x, y] of inputs.slice(0, half)) step(a, [x, y]);
        const buf = createSnapshotBuf(a.state);
        snapshot(a.state, buf);
        restore(b.state, buf);
        expect(hash(b.state)).toBe(hash(a.state));
        for (const [x, y] of inputs.slice(half)) {
          step(a, [x, y]);
          step(b, [x, y]);
        }
        expect(hash(b.state)).toBe(hash(a.state));
      }),
      FC,
    );
  });

  it('bot matches are reproducible, and restoring mid-run then replaying the recorded commands matches', () => {
    fc.assert(
      fc.property(setupArb, fc.integer({ min: 1, max: MAX_TICKS - 1 }), (setup, cut) => {
        const play = (): { final: number; cmds: [Command, Command][]; mid: ReturnType<typeof createSnapshotBuf> } => {
          const world = createMatch(setup);
          const bots: readonly [Agent, Agent] = [new RandomBot('r0'), new RandomBot('r1')];
          const mid = createSnapshotBuf(world.state);
          const cmds: [Command, Command][] = [];
          for (let t = 0; t < MAX_TICKS; t++) {
            if (t === cut) snapshot(world.state, mid);
            const c = collectCommands(world, bots);
            cmds.push(c);
            step(world, c);
          }
          return { final: hash(world.state), cmds, mid };
        };
        const a = play();
        const b = play();
        expect(b.final).toBe(a.final);
        expect(b.cmds).toEqual(a.cmds);
        const world = createMatch(setup);
        restore(world.state, a.mid);
        for (const c of a.cmds.slice(cut)) step(world, c);
        expect(hash(world.state)).toBe(a.final);
      }),
      FC,
    );
  });
});

describe('sim properties: command constants', () => {
  it('Classic command bits do not overlap the reserved mask; Arcade bits are Arcade-only', () => {
    const { super: superBit, ...classic } = Cmd;
    const all = Object.values(classic).reduce<Command>((m, b) => m | b, 0);
    expect(all & CMD_RESERVED_MASK).toBe(0);
    expect(superBit & ARCADE_CMD_BITS).toBe(superBit);
    expect(superBit & inputMaskFor({ rulesetArcade: false })).toBe(0);
    expect(superBit & inputMaskFor({ rulesetArcade: true })).toBe(superBit);
  });
});
