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
import {
  ARCADE_E,
  ARCADE_T,
  ARCADE_TEAM_BASE,
  ARCADE_WORLD_BASE,
  ArcadeE,
  ArcadeT,
  ArcadeW,
  EntityFlag,
  EntityKind,
  MAX_ENTITIES,
  STATUS_SLOTS,
  STATUS_STRIDE,
  TEAM_COUNT,
  TEAM_STRIDE,
  TeamField,
  World,
  cooldownIdx,
  countIdx,
} from './state';
import { ABILITY_DEFS } from './systems/projectile';
import { abilitySlot } from './systems/ability-info';
import { hasEnded } from './systems/end';
import { step } from './step';
import { isArcade, isFrozen, now } from './clock';
import {
  BUFFER_TICKS,
  COMBO_STUN_CAP_TICKS,
  DASH_COOLDOWN_TICKS,
  DASH_TICKS,
  HitStopCause,
  JUGGLE_LIMIT,
  KO_ENTRANCE_INVULN_TICKS,
  KO_HIT_STOP_TICKS,
  METER_BAR,
  METER_MAX,
  ROUNDS_TO_WIN,
  ROUND_TIMER_TICKS,
  RoundPhase,
  SUPER_FREEZE_TICKS,
  TAG_COOLDOWN_TICKS,
  TAG_INVULN_TICKS,
  WEATHER_COOLDOWN_TICKS,
  WEATHER_TICKS,
  arcadePlayfield,
} from '../data/arcade';
import { CHORD_FLAG, PRESS_BITS, pressAge } from './systems/arcade/buffer';
import { SUPER_DEF } from './systems/arcade/hit';
import { skipIntro } from './systems/arcade/round-testkit';
import { castDir } from './systems/arcade/aim';
import { facingFor } from './systems/movement';
import { DIR8_X, DIR8_Y } from '../math/dir8';
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
vi.setConfig({ testTimeout: RUNS > 100 ? 900_000 : 60_000 });

const EVENT_BOUND = 64;
const CAPTURE_DEF_INDEX = ABILITY_DEFS.findIndex((d) => d.id === 'capture');

const rosterArb = fc.array(
  fc.record({
    character: fc.constantFrom(...CHARACTERS.map((c) => c.id)),
    xp: fc.integer({ min: 0, max: 400 }),
  }),
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
  .map((runs) =>
    runs.flatMap(([n, a, b]) => Array.from({ length: n }, (): [number, number] => [a, b])),
  );
const inputsArb = fc.oneof(cmdsArb, stickyArb);

type Cmds = readonly (readonly [number, number])[];

function aliveCount(w: SimWorld): number {
  let n = 0;
  for (let i = 0; i < MAX_ENTITIES; i++)
    if (((w.state.flags[i] ?? 0) & EntityFlag.alive) !== 0) n++;
  return n;
}

/** Cooldown-until values: both teams' swap cooldowns, then every character's four ability slots. */
function cooldowns(w: SimWorld): number[] {
  const out: number[] = [];
  for (let t = 0; t < TEAM_COUNT; t++)
    out.push(w.state.teams[t * TEAM_STRIDE + TeamField.swapCooldownUntil] ?? 0);
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (
      w.state.kind[i] !== EntityKind.character ||
      ((w.state.flags[i] ?? 0) & EntityFlag.alive) === 0
    )
      continue;
    for (let k = 0; k < 4; k++) out.push(w.state.abil[cooldownIdx(i, k)] ?? 0);
  }
  return out;
}

/** Checks every per-step invariant; throws with a description on the first violation. */
function checkInvariants(
  w: SimWorld,
  prevTick: number,
  events: readonly SimEvent[],
  wasFrozen: boolean,
): void {
  const s = w.state;
  const fail = (msg: string): never => {
    throw new Error(`tick ${String(prevTick + 1)}: ${msg}`);
  };
  if ((s.world[World.tick] ?? 0) !== prevTick + 1) fail('tick did not advance by exactly 1');
  for (const name of [
    'x',
    'y',
    'px',
    'py',
    'vx',
    'vy',
    'w',
    'h',
    'hp',
    'maxHp',
    'speed',
  ] as const) {
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
      if (hp < 0 || hp > (s.maxHp[i] ?? 0))
        fail(`hp ${String(hp)} out of [0, ${String(s.maxHp[i])}] for ${String(i)}`);
      if ((f & EntityFlag.dead) !== 0 && hp !== 0)
        fail(`dead character ${String(i)} has hp ${String(hp)}`);
      if ((f & EntityFlag.dead) === 0 && hp === 0)
        fail(`character ${String(i)} has hp 0 but is not dead`);
      if ((f & EntityFlag.dead) === 0 && (f & EntityFlag.benched) === 0) {
        const x = s.x[i] ?? 0;
        const y = s.y[i] ?? 0;
        // Both axes are held inside the arena (KNOWN-BUG:bounds-y-typo is harmless in legacy).
        if (x < a.x || x + (s.w[i] ?? 0) > a.x + a.w)
          fail(`character ${String(i)} outside arena in x at ${String(x)}`);
        if (y < a.y || y + (s.h[i] ?? 0) > a.y + a.h)
          fail(`character ${String(i)} outside arena in y at ${String(y)}`);
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
    // An Arcade parry hands a reflected bullet's count to the parrier (arcade/guard.ts); one without that ability has
    // no count to take, so the bullet flies on uncounted.
    if (abilitySlot(s, s.owner[i] ?? 0, s.defId[i] ?? 0) < 0) continue;
    const key = (s.team[i] ?? 0) * 100 + (s.defId[i] ?? 0);
    live.set(key, (live.get(key) ?? 0) + 1);
  }
  // Active counts live on the characters (legacy abilitiesInfo). A hit releases on the shooter team's current character
  // (KNOWN-BUG:bullet-count-on-active), so a team's sum can only stay above its live entities, never drop below.
  for (let t = 0; t < TEAM_COUNT; t++) {
    for (let d = 0; d < ABILITY_DEFS.length; d++) {
      let n = 0;
      for (let i = 0; i < MAX_ENTITIES; i++) {
        if (
          s.kind[i] !== EntityKind.character ||
          s.team[i] !== t ||
          ((s.flags[i] ?? 0) & EntityFlag.alive) === 0
        )
          continue;
        const slot = abilitySlot(s, i, d);
        if (slot < 0) continue;
        const c = s.abil[countIdx(i, slot)] ?? 0;
        if (c > (ABILITY_DEFS[d]?.maxActive ?? Infinity))
          fail(`active count ${String(c)} > maxActive for ${String(i)} def ${String(d)}`);
        n += c;
      }
      if (ABILITY_DEFS[d]?.kind === 'omni') {
        // KNOWN-BUG:omni-no-cooldown: omni bullets despawn without ever being counted, so the counter only drifts down;
        // an Arcade parry counts a reflected omni bullet on its parrier until it is released.
        if (n > (isArcade(s) ? (live.get(t * 100 + d) ?? 0) : 0))
          fail(`omni active count ${String(n)} > 0 for team ${String(t)} def ${String(d)}`);
      } else if (n < (live.get(t * 100 + d) ?? 0)) {
        fail(`active count ${String(n)} < live entities for team ${String(t)} def ${String(d)}`);
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
  checkAim(w, fail);
  checkArcade(w, events, wasFrozen, fail);
}

/**
 * 8-way aim (FUN-DESIGN 2.12): character reels stay 4-way and are the x-wins facing of the cast aim (`castDir`, the
 * plain facing in Classic); every bullet flies exactly DIR8 * speed (diagonals +-speed on both axes); only omni fans
 * fly diagonally in Classic.
 */
function checkAim(w: SimWorld, fail: (m: string) => never): void {
  const s = w.state;
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (((s.flags[i] ?? 0) & EntityFlag.alive) === 0) continue;
    const dir = s.dir[i] ?? 0;
    if (s.kind[i] === EntityKind.character) {
      const aim = castDir(s, i);
      if ((dir & 1) !== 0 || facingFor(DIR8_X[aim] ?? 0, DIR8_Y[aim] ?? 0, -1) !== dir)
        fail(`character ${String(i)} dir ${String(dir)} aim ${String(aim)}`);
    } else if (s.kind[i] === EntityKind.projectile) {
      const sp = s.speed[i] ?? 0;
      if (s.vx[i] !== (DIR8_X[dir] ?? 0) * sp || s.vy[i] !== (DIR8_Y[dir] ?? 0) * sp)
        fail(`bullet ${String(i)} off its dir8`);
      if (!isArcade(s) && (dir & 1) !== 0 && ABILITY_DEFS[s.defId[i] ?? 0]?.kind !== 'omni')
        fail(`Classic diagonal bullet ${String(i)}`);
    }
  }
}

/** Arcade invariants: a frozen step is silent; every hit stops the clock for at most KO_HIT_STOP_TICKS; caps; meter. */
function checkArcade(
  w: SimWorld,
  events: readonly SimEvent[],
  wasFrozen: boolean,
  fail: (m: string) => never,
): void {
  const s = w.state;
  if (!isArcade(s)) {
    if (events.some((e) => e.kind >= 40)) fail('Arcade event in Classic');
    return;
  }
  if (wasFrozen && events.length > 0) fail('events while frozen');
  // Playfield insets: no character, in play or benched, is ever outside the Arcade playfield.
  const pf = arcadePlayfield();
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (s.kind[id] !== EntityKind.character || ((s.flags[id] ?? 0) & EntityFlag.alive) === 0) continue;
    const [x, y] = [s.x[id] ?? 0, s.y[id] ?? 0];
    if (x < pf.x || y < pf.y || x + (s.w[id] ?? 0) > pf.x + pf.w || y + (s.h[id] ?? 0) > pf.y + pf.h)
      fail(`character ${String(id)} outside the playfield at (${String(x)}, ${String(y)})`);
  }
  const left =
    (s.arcade[ARCADE_WORLD_BASE + ArcadeW.freezeUntil] ?? 0) - (s.world[World.tick] ?? 0);
  if (left > Math.max(KO_HIT_STOP_TICKS, SUPER_FREEZE_TICKS))
    fail(`freeze of ${String(left)} ticks`);
  // Guarded and parried hits stop the clock too (FUN-DESIGN 2.8).
  const stopping: number[] = [
    SimEventKind.hitConfirmed,
    SimEventKind.guarded,
    SimEventKind.parried,
  ];
  const hits = events.filter((e) => stopping.includes(e.kind)).length;
  const stops = events.filter(
    (e) => e.kind === SimEventKind.hitStop && e['cause'] !== HitStopCause.super,
  ).length;
  // Every hit stops the clock; a KO that no hit caused takes the round's KO stop (one per `ko`).
  const kos = events.filter((e) => e.kind === SimEventKind.ko).length;
  if (stops < hits || stops > hits + kos) fail('hit without hit-stop');
  if (hits > 0 && !isFrozen(s)) fail('hit did not freeze');
  // Stun and knockback (FUN-DESIGN 2.3): the caps hold, a stun never outlasts its combo's budget, and walls hold y too.
  const g = now(s);
  for (let i = 0; i < MAX_ENTITIES; i++) {
    const e = i * ARCADE_E;
    const juggle = s.arcade[e + ArcadeE.juggle] ?? 0;
    const total = s.arcade[e + ArcadeE.comboStunTotal] ?? 0;
    if (juggle > JUGGLE_LIMIT || total > COMBO_STUN_CAP_TICKS)
      fail(`juggle ${String(juggle)}, stun total ${String(total)}`);
    if ((s.arcade[e + ArcadeE.stunUntil] ?? 0) - g > total)
      fail(`stun of ${String(i)} outlasts its combo budget`);
    const f = s.flags[i] ?? 0;
    if (
      s.kind[i] !== EntityKind.character ||
      (f & EntityFlag.alive) === 0 ||
      (f & EntityFlag.benched) !== 0
    )
      continue;
    const y = s.y[i] ?? 0;
    if (y < w.arena.y || y + (s.h[i] ?? 0) > w.arena.y + w.arena.h)
      fail(`character ${String(i)} outside arena in y`);
  }
  // Combos (FUN-DESIGN 2.4): the juggle cap bounds a combo at JUGGLE_LIMIT + 2 hits (start, juggles, the capped hit).
  for (let t = 0; t < TEAM_COUNT; t++) {
    const hits = s.arcade[ARCADE_TEAM_BASE + t * ARCADE_T + ArcadeT.comboHits] ?? 0;
    if (hits < 0 || hits > JUGGLE_LIMIT + 2)
      fail(`team ${String(t)} combo of ${String(hits)} hits`);
  }
  for (const e of events) {
    if (e.kind === SimEventKind.comboEnded && (e['hits'] ?? 0) < 1) fail('empty combo ended');
  }
  // Hyper meter (FUN-DESIGN 2.5): within 0..METER_MAX, and a team's last meterLevel of the tick names its bars.
  for (let t = 0; t < TEAM_COUNT; t++) {
    const meter = s.arcade[ARCADE_TEAM_BASE + t * ARCADE_T + ArcadeT.meter] ?? 0;
    if (meter < 0 || meter > METER_MAX) fail(`team ${String(t)} meter ${String(meter)}`);
    const last = events.filter((e) => e.kind === SimEventKind.meterLevel && e['team'] === t).at(-1);
    if (last && last['bars'] !== Math.floor(meter / METER_BAR))
      fail(`meterLevel ${String(last['bars'])} for meter ${String(meter)}`);
  }
  // Supers (FUN-DESIGN 2.5): `superState` names the team's one live super entity, owned by a character of the team.
  for (let t = 0; t < TEAM_COUNT; t++) {
    const fx = (s.arcade[ARCADE_TEAM_BASE + t * ARCADE_T + ArcadeT.superState] ?? 0) - 1;
    let live = 0;
    for (let i = 0; i < MAX_ENTITIES; i++) {
      if (
        s.kind[i] === EntityKind.effect &&
        s.defId[i] === SUPER_DEF &&
        s.team[i] === t &&
        ((s.flags[i] ?? 0) & EntityFlag.alive) !== 0
      )
        live++;
    }
    if (
      live !== (fx >= 0 ? 1 : 0) ||
      (fx >= 0 && (s.defId[fx] !== SUPER_DEF || s.team[s.owner[fx] ?? 0] !== t))
    )
      fail(`team ${String(t)} super state ${String(fx)} with ${String(live)} live supers`);
  }
  for (const e of events) {
    if (e.kind === SimEventKind.superStarted && !isFrozen(s)) fail('super did not freeze');
  }
  // Input buffer (FUN-DESIGN 2.12): no press is stamped in the future; `pressUsed` holds press bits and CHORD_FLAG only.
  for (let t = 0; t < TEAM_COUNT; t++) {
    const b = ARCADE_TEAM_BASE + t * ARCADE_T;
    for (let k = 0; k < PRESS_BITS.length; k++) {
      if ((s.arcade[b + ArcadeT.pressTick + k] ?? 0) - 1 > g)
        fail(`team ${String(t)} press ${String(k)} in the future`);
    }
    if (
      ((s.arcade[b + ArcadeT.pressUsed] ?? 0) & ~(CHORD_FLAG | ((1 << PRESS_BITS.length) - 1))) !==
      0
    )
      fail('bad pressUsed');
  }
  // Dash (FUN-DESIGN 2.7): a dash lasts at most DASH_TICKS and its next one is ready no sooner than DASH_COOLDOWN_TICKS
  // after its start; `dashed` books that on its tick, and a perfect dodge marks its dash.
  for (let i = 0; i < MAX_ENTITIES; i++) {
    const until = s.arcade[i * ARCADE_E + ArcadeE.dashUntil] ?? 0;
    const ready = s.arcade[i * ARCADE_E + ArcadeE.dashReadyAt] ?? 0;
    if (until - g >= DASH_TICKS || (until > 0 && ready - until < DASH_COOLDOWN_TICKS - DASH_TICKS))
      fail(`dash of ${String(i)}`);
  }
  for (const e of events) {
    const at = (f: number): number => s.arcade[e.sourceId * ARCADE_E + f] ?? 0;
    if (e.kind === SimEventKind.dashed && at(ArcadeE.dashReadyAt) !== g - 1 + DASH_COOLDOWN_TICKS)
      fail('dash cooldown');
    if (e.kind === SimEventKind.perfectDodge && at(ArcadeE.dashDodged) !== 1)
      fail('unmarked perfect dodge');
  }
  // Weather (FUN-DESIGN 2.14): a known kind with a timer within WEATHER_TICKS (an empty slot is all zero), and no
  // character's next cast more than WEATHER_COOLDOWN_TICKS away.
  const weather = s.arcade[ARCADE_WORLD_BASE + ArcadeW.weather] ?? 0;
  const wLeft = (s.arcade[ARCADE_WORLD_BASE + ArcadeW.weatherUntil] ?? 0) - g;
  const owner = s.arcade[ARCADE_WORLD_BASE + ArcadeW.weatherTeam] ?? 0;
  if (
    weather === 0
      ? wLeft !== -g || owner !== 0
      : weather > 5 || wLeft < 0 || wLeft >= WEATHER_TICKS || owner > 1
  ) {
    fail(`weather ${String(weather)} with ${String(wLeft)} ticks left, team ${String(owner)}`);
  }
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if ((s.arcade[i * ARCADE_E + ArcadeE.weatherReadyAt] ?? 0) - g > WEATHER_COOLDOWN_TICKS)
      fail(`weather cooldown of ${String(i)}`);
  }
  checkRounds(w, events, fail);
}

/**
 * Rounds (FUN-DESIGN 2.10): a known phase, at most 3 rounds and 2 wins a side, a timer within its 4500 game ticks; a hit
 * lands only in the fight (or on the tick whose hit ended it with a KO); `roundEnded` reports the stored wins, and
 * `matchEnded` comes only in `over` with a side on 2 wins.
 */
function checkRounds(w: SimWorld, events: readonly SimEvent[], fail: (m: string) => never): void {
  const s = w.state;
  const phase = s.arcade[ARCADE_WORLD_BASE + ArcadeW.phase] ?? -1;
  const round = s.arcade[ARCADE_WORLD_BASE + ArcadeW.round] ?? 0;
  const timer = s.arcade[ARCADE_WORLD_BASE + ArcadeW.roundTimer] ?? -1;
  const won = [0, 1].map((t) => s.arcade[ARCADE_TEAM_BASE + t * ARCADE_T + ArcadeT.roundsWon] ?? 0);
  if (phase < RoundPhase.intro || phase > RoundPhase.over) fail(`phase ${String(phase)}`);
  if (round < 1 || round > 3) fail(`round ${String(round)}`);
  if (timer < 0 || timer > ROUND_TIMER_TICKS) fail(`round timer ${String(timer)}`);
  if (won.some((n) => n > ROUNDS_TO_WIN)) fail(`round wins ${won.join('-')}`);
  const has = (kind: number): boolean => events.some((e) => e.kind === kind);
  if (has(SimEventKind.hitConfirmed) && phase !== RoundPhase.fight && !has(SimEventKind.ko))
    fail('hit outside the fight');
  for (const e of events) {
    if (e.kind === SimEventKind.roundEnded && (e['won0'] !== won[0] || e['won1'] !== won[1]))
      fail('roundEnded wins differ from the state');
    if (
      e.kind === SimEventKind.matchEnded &&
      (phase !== RoundPhase.over || Math.max(won[0] ?? 0, won[1] ?? 0) < ROUNDS_TO_WIN)
    )
      fail('matchEnded before a side has 2 round wins');
  }
}

/**
 * Steps tapped inputs and checks every cast of team 0's primary and secondary: a cast on a tick whose raw command lacks
 * the button (a buffered cast) needs a press that no cast or chord used yet, at most BUFFER_TICKS game ticks old.
 * Returns the number of buffered casts.
 */
function bufferedCasts(setup: MatchSetup, inputs: Cmds): number {
  // Straight into the fight: most tap sequences are shorter than the 91-tick round intro (FUN-DESIGN 2.10).
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  const armed = [false, false];
  const pressedAt = [0, 0];
  let prev = 0;
  let count = 0;
  const team0Cds = (k: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < MAX_ENTITIES; i++) {
      const char =
        s.kind[i] === EntityKind.character && ((s.flags[i] ?? 0) & EntityFlag.alive) !== 0;
      out.push(char && s.team[i] === 0 ? (s.abil[cooldownIdx(i, k)] ?? 0) : 0);
    }
    return out;
  };
  for (const [a, b] of inputs) {
    const g = now(s);
    const before = [team0Cds(0), team0Cds(1)];
    const rise = a & ~prev;
    prev = a;
    for (const k of [0, 1]) {
      if ((rise & (PRESS_BITS[k] ?? 0)) !== 0) {
        armed[k] = true;
        pressedAt[k] = g;
      }
    }
    step(world, [a, b]);
    for (const k of [0, 1]) {
      const cast = team0Cds(k).some((v, i) => v !== before[k]?.[i]);
      if (cast && (a & (PRESS_BITS[k] ?? 0)) === 0) {
        if (!isArcade(s))
          throw new Error(
            `Classic cast of slot ${String(k)} without its button at game tick ${String(g)}`,
          );
        if (armed[k] !== true || g - (pressedAt[k] ?? 0) > BUFFER_TICKS)
          throw new Error(`stale or reused press ${String(k)} at ${String(g)}`);
        count++;
      }
      if (cast || (isArcade(s) && pressAge(s, 0, k) < 0)) armed[k] = false;
    }
  }
  return count;
}

function runInputs(
  setup: MatchSetup,
  inputs: Cmds,
  check = true,
  prep?: (w: SimWorld) => void,
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
        if (v < (prevCd[i] ?? 0))
          throw new Error(`tick ${String(tick)}: cooldown ${String(i)} went backwards`);
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
      for (let t = 0; t < TEAM_COUNT; t++)
        w.state.arcade[ARCADE_TEAM_BASE + t * ARCADE_T + ArcadeT.meter] = METER_MAX;
    };
    fc.assert(
      fc.property(setupArb, inputsArb, (setup, inputs) => {
        const arcade = { ...setup, flags: { ...setup.flags, rulesetArcade: true } };
        const { world, events } = runInputs(arcade, inputs, true, full);
        const all = events.flat();
        const started = all.filter((e) => e.kind === SimEventKind.superStarted).length;
        const live = [0, 1].filter(
          (t) =>
            (world.state.arcade[ARCADE_TEAM_BASE + t * ARCADE_T + ArcadeT.superState] ?? 0) !== 0,
        );
        expect(all.filter((e) => e.kind === SimEventKind.superEnded).length).toBe(
          started - live.length,
        );
        supers += started;
      }),
      FC,
    );
    expect(supers).toBeGreaterThan(0);
  });

  it('hold in Arcade with weather presses: weathers start, and each ends at most once per start', () => {
    let casts = 0;
    fc.assert(
      fc.property(setupArb, inputsArb, (setup, inputs) => {
        const arcade = { ...setup, flags: { ...setup.flags, rulesetArcade: true } };
        // Into the fight at once, so the intro does not eat short input streams.
        const { events } = runInputs(arcade, inputs, true, skipIntro);
        const all = events.flat();
        const started = all.filter(
          (e) => e.kind === SimEventKind.weatherChanged && e['prev'] === 0,
        ).length;
        expect(all.filter((e) => e.kind === SimEventKind.weatherEnded).length).toBeLessThanOrEqual(
          started,
        );
        casts += started;
      }),
      FC,
    );
    expect(casts).toBeGreaterThan(0);
  });

  it('hold in Arcade tag teams: each tag enters at the outgoing spot, invulnerable, and manual tags are 150 apart', () => {
    let tags = 0;
    const duo = (r: MatchSetup['p1']): MatchSetup['p1'] => (r.length > 1 ? r : [...r, ...r]);
    fc.assert(
      fc.property(setupArb, inputsArb, (setup, inputs) => {
        const arcade = { ...setup, flags: { ...setup.flags, rulesetArcade: true }, p1: duo(setup.p1), p2: duo(setup.p2) };
        const w = skipIntro(createMatch(arcade));
        const s = w.state;
        const last = [-TAG_COOLDOWN_TICKS, -TAG_COOLDOWN_TICKS];
        for (const [a, b] of inputs) {
          const tick = s.world[World.tick] ?? 0;
          const wasFrozen = isFrozen(s);
          const g = now(s);
          const ev = step(w, [a, b]);
          checkInvariants(w, tick, ev, wasFrozen);
          const fail = (m: string): never => {
            throw new Error(`tick ${String(tick)}: ${m}`);
          };
          if (ev.some((e) => e.kind === SimEventKind.roundStarted)) last.fill(-TAG_COOLDOWN_TICKS);
          for (const e of ev) {
            if (e.kind !== SimEventKind.tagIn) continue;
            tags++;
            const [from, to, team] = [e['from'] ?? -1, e['to'] ?? -1, e['team'] ?? -1];
            const ko = ((s.flags[from] ?? 0) & EntityFlag.dead) !== 0;
            if (s.px[to] !== s.x[from] || s.py[to] !== s.y[from]) fail(`tag ${String(to)} not at ${String(from)}'s spot`);
            if ((s.arcade[to * ARCADE_E + ArcadeE.invulnUntil] ?? 0) < g + (ko ? KO_ENTRANCE_INVULN_TICKS : TAG_INVULN_TICKS))
              fail(`tag ${String(to)} not invulnerable`);
            if (!ko && g - (last[team] ?? 0) < TAG_COOLDOWN_TICKS) fail(`tag ${String(g - (last[team] ?? 0))} after the last`);
            if (!ev.some((x) => x.kind === SimEventKind.swapped && x['to'] === to)) fail('tagIn without swapped');
            last[team] = g;
          }
        }
      }),
      FC,
    );
    expect(tags).toBeGreaterThan(0);
  });

  it('hold in Arcade with diagonal input: shots and melee go along the 8-way aim', () => {
    let diagonal = 0;
    const diag = fc.constantFrom(
      Cmd.up | Cmd.right,
      Cmd.up | Cmd.left,
      Cmd.down | Cmd.left,
      Cmd.down | Cmd.right,
    );
    const fire = fc.constantFrom(0, Cmd.primary, Cmd.secondary);
    const aimed = fc
      .array(fc.tuple(fc.integer({ min: 1, max: 30 }), diag, fire, cmdArb), {
        minLength: 1,
        maxLength: 12,
      })
      .map((runs) =>
        runs.flatMap(([n, d, f, b]) =>
          Array.from({ length: n }, (_, k): [number, number] => [k === 0 ? d : d | f, b]),
        ),
      );
    fc.assert(
      fc.property(setupArb, aimed, (setup, inputs) => {
        const arcade = { ...setup, flags: { ...setup.flags, rulesetArcade: true } };
        // checkAim runs on every step; at the end, count the live aimed (non-omni) diagonal casts for coverage.
        const s = runInputs(arcade, inputs).world.state;
        for (let i = 0; i < MAX_ENTITIES; i++) {
          const k = s.kind[i];
          if (
            (k !== EntityKind.projectile && k !== EntityKind.melee) ||
            ((s.dir[i] ?? 0) & 1) === 0
          )
            continue;
          if (
            ((s.flags[i] ?? 0) & EntityFlag.alive) !== 0 &&
            ABILITY_DEFS[s.defId[i] ?? 0]?.kind !== 'omni'
          )
            diagonal++;
        }
      }),
      FC,
    );
    expect(diagonal).toBeGreaterThan(0);
  });

  it('hold in Arcade across rounds: legal phase order, best of 3, one matchEnded, half-speed KO slow motion', () => {
    const NEXT: Readonly<Record<number, readonly number[]>> = {
      [RoundPhase.intro]: [RoundPhase.fight],
      [RoundPhase.fight]: [RoundPhase.ko, RoundPhase.roundEnd],
      [RoundPhase.ko]: [RoundPhase.roundEnd],
      [RoundPhase.roundEnd]: [RoundPhase.intro, RoundPhase.over],
      [RoundPhase.over]: [],
    };
    let ended = 0;
    // Low HP so KOs come fast; random bots on both sides; long enough for a whole best of 3.
    const frail = fc.integer({ min: 1, max: 30 });
    fc.assert(
      fc.property(setupArb, frail, (setup, hp) => {
        const world = createMatch({ ...setup, flags: { ...setup.flags, rulesetArcade: true } });
        const s = world.state;
        for (let i = 0; i < MAX_ENTITIES; i++)
          if (s.kind[i] === EntityKind.character) s.maxHp[i] = s.hp[i] = s.restCap[i] = hp;
        const bots: readonly [Agent, Agent] = [new RandomBot('r0'), new RandomBot('r1')];
        let phase: number = RoundPhase.intro;
        let matchEnds = 0;
        let gameAtKo = -1;
        for (let t = 0; t < 2500; t++) {
          const tick = s.world[World.tick] ?? 0;
          const wasFrozen = isFrozen(s);
          const game = now(s);
          const ev = step(world, collectCommands(world, bots));
          checkInvariants(world, tick, ev, wasFrozen);
          if (now(s) - game > 1) throw new Error('game clock jumped');
          const next = s.arcade[ARCADE_WORLD_BASE + ArcadeW.phase] ?? 0;
          if (next !== phase && !(NEXT[phase] ?? []).includes(next))
            throw new Error(`phase ${String(phase)} -> ${String(next)}`);
          // The KO phase: 30 frozen ticks, 60 at half speed, 60 at full speed (from the KO tick to roundEnded: 150 W.ticks,
          // 90 game ticks). A KO from a super freeze still pending can only stretch the frozen part.
          if (ev.some((e) => e.kind === SimEventKind.ko)) gameAtKo = now(s);
          if (
            ev.some((e) => e.kind === SimEventKind.roundEnded) &&
            phase === RoundPhase.ko &&
            now(s) - gameAtKo !== 90
          )
            throw new Error(`KO phase lasted ${String(now(s) - gameAtKo)} game ticks`);
          phase = next;
          matchEnds += ev.filter((e) => e.kind === SimEventKind.matchEnded).length;
        }
        if (matchEnds !== (hasEnded(s) ? 1 : 0)) throw new Error('matchEnded count');
        ended += matchEnds;
      }),
      // Heavy (2500 ticks with invariants every tick): fewer PR runs so the instrumented coverage job stays inside the timeout.
      { ...FC, numRuns: RUNS > 100 ? RUNS : 8 },
    );
    expect(ended).toBeGreaterThan(0);
  });

  it('hold in Arcade with tapped buttons: a buffered cast uses one fresh press, once; Classic never buffers', () => {
    let buffered = 0;
    const press = fc.constantFrom(
      0,
      Cmd.primary,
      Cmd.secondary,
      Cmd.primary | Cmd.secondary,
      Cmd.super,
    );
    const taps = fc
      .array(fc.tuple(fc.integer({ min: 1, max: 12 }), press, cmdArb), {
        minLength: 1,
        maxLength: 40,
      })
      .map((runs) =>
        runs.flatMap(([n, f, b]) =>
          Array.from({ length: n }, (_, k): [number, number] => [k === 0 ? f : 0, b]),
        ),
      );
    fc.assert(
      fc.property(
        setupArb,
        taps,
        fc.integer({ min: 0, max: METER_MAX }),
        (setup, inputs, meter) => {
          const arcade = { ...setup, flags: { ...setup.flags, rulesetArcade: true } };
          buffered += bufferedCasts(arcade, inputs);
          expect(
            bufferedCasts({ ...setup, flags: { ...setup.flags, rulesetArcade: false } }, inputs),
          ).toBe(0);
          // The invariants hold too, with meter for chords.
          runInputs(arcade, inputs, true, (w) => {
            w.state.arcade[ARCADE_TEAM_BASE + ArcadeT.meter] = meter;
          });
        },
      ),
      FC,
    );
    expect(buffered).toBeGreaterThan(0);
  });

  it('ignores command bits outside the ruleset input mask', () => {
    fc.assert(
      fc.property(setupArb, cmdsArb, (setup, inputs) => {
        const m = inputMaskFor(setup.flags);
        const masked = inputs.map(([a, b]): [number, number] => [a & m, b & m]);
        expect(runInputs(setup, inputs, false).hashes).toEqual(
          runInputs(setup, masked, false).hashes,
        );
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
      fc.property(
        setupArb,
        inputsArb,
        fc.nat(),
        fc.integer({ min: 1, max: 8 }),
        (setup, inputs, at, depth) => {
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
        },
      ),
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
        const play = (): {
          final: number;
          cmds: [Command, Command][];
          mid: ReturnType<typeof createSnapshotBuf>;
        } => {
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
    const { super: superBit, dash, guard, weather, ...classic } = Cmd;
    const all = Object.values(classic).reduce<Command>((m, b) => m | b, 0);
    expect(all & CMD_RESERVED_MASK).toBe(0);
    for (const bit of [superBit, dash, guard, weather]) {
      expect(bit & ARCADE_CMD_BITS).toBe(bit);
      expect(bit & inputMaskFor({ rulesetArcade: false })).toBe(0);
      expect(bit & inputMaskFor({ rulesetArcade: true })).toBe(bit);
    }
  });
});
