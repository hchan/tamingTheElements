import { ARENA_HEIGHT, ARENA_WIDTH, CHARACTER_HEIGHT, CHARACTER_WIDTH, GARRISON_MAX_SIZE } from '../data/chapters';
import type { ChapterNumber } from '../data/chapters';
import { CHARACTERS, getCharacter } from '../data/characters';
import type { CharacterId } from '../data/ids';
import type { SimFlags } from '../flags';
import { createStreams, saveStreams } from '../rng/streams';
import { abilitiesFor, combatantStats } from '../rules/progression';
import type { Side } from '../rules/progression';
import { allocEntity } from './alloc';
import { ABILITY_SLOTS, EntityFlag, EntityKind, TEAM_STRIDE, TeamField, World as W } from './state';
import { createWorld, type SimWorld } from './world';

/** One team's members in garrison order; the first is the active character, the rest start benched. */
export type Roster = readonly { readonly character: CharacterId; readonly xp: number }[];

export interface MatchSetup {
  /** Recorded for the replay header; the caller checks it against SIM_VERSION. */
  readonly simVersion: number;
  readonly seed: number;
  readonly flags: SimFlags;
  readonly chapter: ChapterNumber;
  readonly difficulty: number;
  /** Team 0, the player side (health/damage/heal divided by difficulty, Capture after chapter 1). */
  readonly p1: Roster;
  /** Team 1, the enemy side. */
  readonly p2: Roster;
}

/**
 * Start positions: legacy `setStartPosition` is window-relative; mapped to the fixed 1280x720
 * arena as vertically centred, player on the left (x=160) and enemy on the right (mirrored).
 * Benched members share their team's start position.
 */
export const START_Y = (ARENA_HEIGHT - CHARACTER_HEIGHT) / 2;
export const P1_START_X = 160;
export const P2_START_X = ARENA_WIDTH - 160 - CHARACTER_WIDTH;

const EAST = 0;
const WEST = 4;

/** Bit per flag in world[World.flags], in sorted-name order. */
export function flagBits(flags: SimFlags): number {
  return (flags.experimentalPathing ? 1 : 0) | (flags.experimentalSpawnCurve ? 2 : 0);
}

function spawnTeam(world: SimWorld, team: number, roster: Roster, setup: MatchSetup): void {
  if (roster.length > GARRISON_MAX_SIZE) throw new RangeError(`roster too large: ${String(roster.length)}`);
  const s = world.state;
  const side: Side = team === 0 ? 'player' : 'enemy';
  roster.forEach((member, i) => {
    const def = getCharacter(member.character);
    if (abilitiesFor(def, setup.chapter, side).length > ABILITY_SLOTS) throw new RangeError('too many abilities');
    const stats = combatantStats(def, member.xp, side, setup.difficulty);
    const id = allocEntity(s);
    if (id < 0) throw new RangeError('entity capacity exceeded');
    const x = team === 0 ? P1_START_X : P2_START_X;
    s.kind[id] = EntityKind.character;
    s.defId[id] = CHARACTERS.indexOf(def);
    s.team[id] = team;
    s.owner[id] = id;
    s.dir[id] = team === 0 ? EAST : WEST;
    s.flags[id] = EntityFlag.alive | (i === 0 ? 0 : EntityFlag.benched);
    s.x[id] = x;
    s.px[id] = x;
    s.y[id] = START_Y;
    s.py[id] = START_Y;
    s.w[id] = CHARACTER_WIDTH;
    s.h[id] = CHARACTER_HEIGHT;
    s.hp[id] = stats.maxHealth;
    s.maxHp[id] = stats.maxHealth;
    s.dmgMult[id] = stats.damageMultiplier;
    s.healMult[id] = stats.healMultiplier;
    s.speed[id] = def.speed;
    s.baseSpeed[id] = def.speed;
  });
  s.team[team * TEAM_STRIDE + TeamField.activeSlot] = 0;
}

/** Builds the tick-0 world for a match: p1 entities first, then p2, ids in roster order. */
export function createMatch(setup: MatchSetup): SimWorld {
  const world = createWorld(setup.seed);
  const s = world.state;
  s.world[W.flags] = flagBits(setup.flags);
  s.rng.set(saveStreams(createStreams(setup.seed)));
  spawnTeam(world, 0, setup.p1, setup);
  spawnTeam(world, 1, setup.p2, setup);
  return world;
}
