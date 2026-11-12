import { type Command, NO_COMMAND } from '../sim/commands';
import {
  ARCADE_E,
  ARCADE_T,
  ARCADE_TEAM_BASE,
  ARCADE_WORLD_BASE,
  ArcadeE,
  ArcadeT,
  ArcadeW,
  cooldownIdx,
  EntityFlag,
  EntityKind,
  TEAM_STRIDE,
  TeamField,
  TRAP_STRIDE,
  TRAP_TABLE,
  TRAP_WORLD_MAX,
  TrapF,
  World,
  type SimState,
} from '../sim/state';
import type { SimWorld } from '../sim/world';
import { ARCADE_SNAG_SLOT, SNAG_FIRE_ABILITIES } from '../data/arcade';
import { CHARACTERS } from '../data/characters';
import { isArcade, now, roundPhase } from '../sim/clock';
import { Press, pressAge } from '../sim/systems/arcade/buffer';
import { RANGED } from '../sim/systems/arcade/meter';
import { isGuarding } from '../sim/systems/arcade/stun';
import { superSpecOf } from '../sim/systems/arcade/super';
import { kindOf, patchRects, stageOf } from '../sim/systems/arcade/terrain';
import { trapCount } from '../sim/systems/arcade/trap';

/** Read-only snapshot of one fighter; plain numbers, never aliases sim arrays. */
export interface FighterView {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly flags: number;
  readonly alive: boolean;
}

/** Read-only facade over a SimWorld for one side. Mutable arrays are never exposed. */
export interface ObservationView {
  readonly side: 0 | 1;
  readonly tick: number;
  /** The side's active fighter, or undefined when none is on the field. */
  readonly self: FighterView | undefined;
  readonly opponent: FighterView | undefined;
  /** Ticks until each ability slot of this side is ready (0 = ready). */
  readonly cooldowns: readonly number[];
  /** The match seed, so an agent can seed its own stream (`AgentRng`); agents never draw from the sim's streams. */
  readonly matchSeed: number;
  /** Arcade state both players can see on the HUD (FUN-DESIGN 2.11); absent in Classic. */
  readonly arcade?: ArcadeView;
}

/**
 * Read-only copy of the visible Arcade state for one side: nothing a human could not read off the screen. Stun is in
 * game ticks left (0 = free), `freeze` in `W.tick` ticks left of a hit-stop or super freeze. Own cooldowns are
 * `ObservationView.cooldowns` (game ticks in Arcade).
 */
export interface ArcadeView {
  readonly meter: number;
  readonly oppMeter: number;
  readonly selfStun: number;
  readonly oppStun: number;
  readonly freeze: number;
  /** Live combo hits of this side (on the opponent) and of the opponent (on this side). */
  readonly combo: number;
  readonly oppCombo: number;
  /** This side's super is running (its caster cannot act until it ends). */
  readonly superActive: boolean;
  /** The id of the super this side's fighter casts (`SuperSpec.id`; 0 is the generic Elemental Burst). */
  readonly superId: number;
  /** Round phase (a `RoundPhase`, FUN-DESIGN 2.10): only `fight` (1) lets anyone act. */
  readonly phase: number;
  /**
   * This side's last command as the sim recorded it, and the game ticks since its last primary and secondary press (-1:
   * none, or used by a super chord), so an agent can see whether a press would complete a chord (FUN-DESIGN 2.12).
   */
  readonly prevCmd: Command;
  readonly primaryAge: number;
  readonly secondaryAge: number;
  /**
   * Every live enemy projectile and melee box on the field, in entity id order (WP-arcade-ai-personalities): position,
   * size and velocity per game tick (a melee box has none). Only what the screen shows; the AI predicts from it.
   */
  readonly shots: readonly ShotView[];
  /** Game ticks until this side's dash and weather are ready (0: ready now). */
  readonly dashIn: number;
  readonly weatherIn: number;
  /** Game ticks until this side's melee Charge is ready (0: now), or -1 for a ranged hero, which has none (FUN-DESIGN 2.17). */
  readonly chargeIn: number;
  /** This side's weather charge, 0..WEATHER_CHARGE_FULL; weather needs it full (FUN-DESIGN 2.14). */
  readonly weatherCharge: number;
  /**
   * Tag team (FUN-DESIGN 2.6): game ticks until this side may tag (0: now), and the HP per mille of the partner a
   * `Cmd.swap1` tag brings in (the first living teammate in roster order, `tagTargets`; -1 when there is none);
   * `partner2Pm` the same for `Cmd.swap2`, the other bench hero in 3v3 (WP-arcade-3v3; always -1 in 1v1 and 2v2).
   */
  readonly tagIn: number;
  readonly partnerPm: number;
  readonly partner2Pm: number;
  /**
   * The rocks (FUN-DESIGN 2.15) this side cannot cross: the earth patches when the stage is earth and this side's
   * fighter is not of the earth element, else none. Fresh plain rectangles.
   */
  readonly rocks: readonly RockView[];
  /**
   * Snag (FUN-DESIGN 2.20): the slot (0 or 1) of this side's Snag throw, or -1 for a hero without one; whether the
   * opponent holds guard (a guard wastes the throw); game ticks left of the opponent's root and of its root immunity.
   */
  readonly snagSlot: number;
  readonly oppGuarding: boolean;
  readonly oppRooted: number;
  readonly oppRootImmune: number;
  /**
   * Traps (WP 39c): every live trap on the field in table order (the rings the screen shows, both teams); game ticks
   * until this side's fighter may plant again (0: now) and its team's live traps (the cap is TRAP_TEAM_MAX); whether
   * this side's primary is a fire shot (it douses foe Puddles and Gusts).
   */
  readonly traps: readonly TrapView[];
  readonly trapIn: number;
  readonly trapCount: number;
  readonly fireShot: boolean;
}

/**
 * One trap as `ArcadeView.traps` lists it: its `TrapKind`, the top-left of its TRAP_BOX_PX square, whether this side
 * owns it, game ticks until it arms (0: armed) and until its fuse or life ends.
 */
export interface TrapView {
  readonly kind: number;
  readonly x: number;
  readonly y: number;
  readonly own: boolean;
  readonly armIn: number;
  readonly left: number;
}

/** One rock as `ArcadeView.rocks` lists it; plain numbers. */
export interface RockView {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One enemy projectile or melee box as `ArcadeView.shots` lists it; plain numbers. */
export interface ShotView {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly vx: number;
  readonly vy: number;
}

/** Opaque, JSON-serialisable agent memory: what `Agent.save` returns and only the same kind of agent can `load`. */
export type AgentState =
  null | boolean | number | string | readonly AgentState[] | { readonly [key: string]: AgentState };

export interface Agent {
  readonly id: string;
  observe(view: ObservationView, tick: number): Command;
  /**
   * Everything that can change a later command (memory, timers, random stream) as fresh plain data that shares
   * nothing with the agent. Agent memory is not in SimState, so a rollback must restore it next to the world.
   */
  save(): AgentState;
  /** Exact inverse of save(): afterwards the agent issues the same commands as the one that was saved. */
  load(state: AgentState): void;
}

/**
 * Both sides' agent memory at one tick, stored next to the world snapshot of that tick (`SnapshotRing<AgentSnapshot>`)
 * so a restore rewinds the bots as well as the sim.
 */
export type AgentSnapshot = readonly [AgentState, AgentState];

export function saveAgents(agents: readonly [Agent | undefined, Agent | undefined]): AgentSnapshot {
  return [agents[0]?.save() ?? null, agents[1]?.save() ?? null];
}

export function loadAgents(
  agents: readonly [Agent | undefined, Agent | undefined],
  snap: AgentSnapshot,
): void {
  agents[0]?.load(snap[0]);
  agents[1]?.load(snap[1]);
}

/** Reads a saved agent state back as a record; throws when it is not one (a state from another kind of agent). */
export function stateRecord(state: AgentState, id: string): { readonly [key: string]: AgentState } {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError(`${id}: agent state is not a record`);
  }
  return state as { readonly [key: string]: AgentState };
}

/** A number field of a saved agent state; throws when it is missing or not a number. */
export function stateNumber(rec: { readonly [key: string]: AgentState }, key: string): number {
  const v = rec[key];
  if (typeof v !== 'number') throw new TypeError(`agent state field ${key} is not a number`);
  return v;
}

function fighterOf(world: SimWorld, team: number): FighterView | undefined {
  const s = world.state;
  for (let i = 0; i < s.kind.length; i++) {
    const flags = s.flags[i] ?? 0;
    if (s.kind[i] !== EntityKind.character || s.team[i] !== team) continue;
    if ((flags & EntityFlag.alive) === 0 || (flags & EntityFlag.benched) !== 0) continue;
    return {
      id: i,
      x: s.x[i] ?? 0,
      y: s.y[i] ?? 0,
      w: s.w[i] ?? 0,
      h: s.h[i] ?? 0,
      hp: s.hp[i] ?? 0,
      maxHp: s.maxHp[i] ?? 0,
      flags,
      alive: true,
    };
  }
  return undefined;
}

/**
 * The HP per mille of the heroes Tag 1 and Tag 2 bring in: the living teammates in roster order (`tagTargets`), -1 for
 * none. With no active hero: the roster order, a downed hero as -1.
 */
function partnersPm(s: SimState, members: readonly number[], self: FighterView | undefined): { partnerPm: number; partner2Pm: number } {
  const pm = (i: number): number => ((s.flags[i] ?? 0) & EntityFlag.dead) !== 0 ? -1 : Math.floor(((s.hp[i] ?? 0) * 1000) / (s.maxHp[i] ?? 1));
  const others = members.filter((m) => m !== self?.id).map(pm);
  const order = self === undefined ? others : others.filter((p) => p >= 0);
  return { partnerPm: order[0] ?? -1, partner2Pm: order[1] ?? -1 };
}

function arcadeViewOf(
  s: SimState,
  side: number,
  self: FighterView | undefined,
  opp: FighterView | undefined,
): ArcadeView {
  const a = s.arcade;
  const g = now(s);
  const team = (t: number, f: number): number => a[ARCADE_TEAM_BASE + t * ARCADE_T + f] ?? 0;
  const left = (f: FighterView | undefined, field: number): number =>
    f === undefined ? 0 : Math.max(0, (a[f.id * ARCADE_E + field] ?? 0) - g);
  const shots: ShotView[] = [];
  const members: number[] = [];
  for (let i = 0; i < s.kind.length; i++) {
    const k = s.kind[i];
    const f = s.flags[i] ?? 0;
    if (k === EntityKind.character && s.team[i] === side && (f & EntityFlag.alive) !== 0) members.push(i);
    // A freed slot is cleared (kind 0, a character), so a projectile kind is a live projectile.
    if (k === EntityKind.projectile && s.team[i] !== side) {
      shots.push({ x: s.x[i] ?? 0, y: s.y[i] ?? 0, w: s.w[i] ?? 0, h: s.h[i] ?? 0, vx: s.vx[i] ?? 0, vy: s.vy[i] ?? 0 });
    }
  }
  return {
    meter: team(side, ArcadeT.meter),
    oppMeter: team(1 - side, ArcadeT.meter),
    selfStun: left(self, ArcadeE.stunUntil),
    oppStun: left(opp, ArcadeE.stunUntil),
    freeze: Math.max(
      0,
      (a[ARCADE_WORLD_BASE + ArcadeW.freezeUntil] ?? 0) - (s.world[World.tick] ?? 0),
    ),
    combo: team(side, ArcadeT.comboHits),
    oppCombo: team(1 - side, ArcadeT.comboHits),
    superActive: team(side, ArcadeT.superState) !== 0,
    superId: self === undefined ? 0 : superSpecOf(s, self.id).id,
    phase: roundPhase(s),
    prevCmd: team(side, ArcadeT.prevCmd),
    primaryAge: pressAge(s, side, Press.primary),
    secondaryAge: pressAge(s, side, Press.secondary),
    shots,
    dashIn: left(self, ArcadeE.dashReadyAt),
    weatherIn: left(self, ArcadeE.weatherReadyAt),
    chargeIn: RANGED[s.defId[self?.id ?? 0] ?? 0] ? -1 : left(self, ArcadeE.chargeReadyAt),
    weatherCharge: team(side, ArcadeT.weatherCharge),
    tagIn: Math.max(0, (s.teams[side * TEAM_STRIDE + TeamField.swapCooldownUntil] ?? 0) - g),
    ...partnersPm(s, members, self),
    rocks: stageOf(s) === 3 && self !== undefined && kindOf(s, self.id) !== 3 ? patchRects(s) : [],
    snagSlot: self === undefined ? -1 : (ARCADE_SNAG_SLOT[CHARACTERS[s.defId[self.id] ?? 0]?.id ?? ''] ?? -1),
    oppGuarding: opp !== undefined && isGuarding(s, opp.id),
    oppRooted: left(opp, ArcadeE.rootUntil),
    oppRootImmune: left(opp, ArcadeE.rootImmuneUntil),
    traps: trapsOf(s, side, g),
    trapIn: left(self, ArcadeE.trapReadyAt),
    trapCount: trapCount(s, side),
    fireShot: self !== undefined && SNAG_FIRE_ABILITIES.includes(CHARACTERS[s.defId[self.id] ?? 0]?.abilities[0] ?? ''),
  };
}

/** The live traps of the world trap table in slot order, for `side` at game tick `g`. */
function trapsOf(s: SimState, side: number, g: number): TrapView[] {
  const out: TrapView[] = [];
  for (let slot = 0; slot < TRAP_WORLD_MAX; slot++) {
    const b = ARCADE_WORLD_BASE + TRAP_TABLE + slot * TRAP_STRIDE;
    const kind = s.arcade[b + TrapF.kind] ?? 0;
    if (kind === 0) continue;
    out.push({
      kind,
      x: s.arcade[b + TrapF.x] ?? 0,
      y: s.arcade[b + TrapF.y] ?? 0,
      own: s.arcade[b + TrapF.team] === side,
      armIn: Math.max(0, (s.arcade[b + TrapF.armAt] ?? 0) - g),
      left: Math.max(0, (s.arcade[b + TrapF.endAt] ?? 0) - g),
    });
  }
  return out;
}

export function createObservationView(world: SimWorld, side: 0 | 1): ObservationView {
  const s = world.state;
  const tick = s.world[World.tick] ?? 0;
  const gameTick = now(s);
  const self = fighterOf(world, side);
  const opponent = fighterOf(world, 1 - side);
  return {
    side,
    tick,
    matchSeed: s.world[World.matchSeed] ?? 0,
    self,
    opponent,
    // The active character's own cooldowns (legacy abilitiesInfo is per character).
    cooldowns: Array.from({ length: 4 }, (_, k) =>
      self === undefined ? 0 : Math.max(0, (s.abil[cooldownIdx(self.id, k)] ?? 0) - gameTick),
    ),
    ...(isArcade(s) && { arcade: arcadeViewOf(s, side, self, opponent) }),
  };
}

/**
 * Runs one agent per side and returns the command pair for `step`. Reads the world only: SimState is mutated by
 * `step` alone, so consulting agents (or not) never changes the state or its hash.
 */
export function collectCommands(
  world: SimWorld,
  agents: readonly [Agent | undefined, Agent | undefined],
): [Command, Command] {
  const tick = world.state.world[World.tick] ?? 0;
  const out: [Command, Command] = [NO_COMMAND, NO_COMMAND];
  for (const side of [0, 1] as const) {
    out[side] = agents[side]?.observe(createObservationView(world, side), tick) ?? NO_COMMAND;
  }
  return out;
}
