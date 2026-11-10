import { CHARACTERS } from '../data/characters';
import { characterId } from '../data/ids';
import { DEFAULT_SIM_FLAGS } from '../flags';
import { Cmd, NO_COMMAND, type Command } from './commands';
import { createMatch } from './match';
import { EntityFlag, EntityKind, MAX_ENTITIES, TEAM_COOLDOWNS } from './state';
import { step } from './step';
import type { SimWorld } from './world';

/** Controlled 1v1 probe of one ability slot: caster (team 0, hp 50) vs the idle dummy (team 1). Used by the port-gap audit. */
export interface ProbeResult {
  readonly race: string;
  readonly slot: number;
  readonly ability: string;
  /** Anything spawned, any status applied or any cooldown booked. */
  readonly fired: boolean;
  readonly targetDamage: number;
  readonly casterHeal: number;
  readonly casterSpeedDelta: number;
  readonly targetSpeedDelta: number;
  readonly targetFrozen: boolean;
  readonly casterTranslucent: boolean;
}

export const PROBE_GAP = 100;
export const PROBE_TICKS = 150;
const TARGET_HP = 10000;

function setup(race: string, gap: number): SimWorld {
  const roster = (r: string): { character: ReturnType<typeof characterId>; xp: number }[] => [
    { character: characterId(r), xp: 0 },
  ];
  const world = createMatch({
    simVersion: 0, seed: 1, flags: DEFAULT_SIM_FLAGS, chapter: 1, difficulty: 1, p1: roster(race), p2: roster('dummy'),
  });
  const s = world.state;
  s.x[1] = (s.x[0] ?? 0) + gap;
  s.px[1] = s.x[1];
  s.y[1] = s.y[0] ?? 0;
  s.py[1] = s.y[0] ?? 0;
  // A tanky target keeps accumulating damage instead of dying inside the probe window.
  s.hp[1] = TARGET_HP;
  s.maxHp[1] = TARGET_HP;
  return world;
}

function spawned(world: SimWorld): boolean {
  const s = world.state;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (((s.flags[id] ?? 0) & EntityFlag.alive) !== 0 && s.kind[id] !== EntityKind.character && s.team[id] === 0) return true;
  }
  return false;
}

const bitOf = (slot: 0 | 1): Command => (slot === 0 ? Cmd.primary : Cmd.secondary);

/** Holds `slot` (0 primary, 1 secondary) for PROBE_TICKS; the dummy never acts. */
export function probeAbility(race: string, slot: 0 | 1): ProbeResult {
  const world = setup(race, PROBE_GAP);
  const s = world.state;
  s.hp[0] = 50;
  const casterSpeed0 = s.speed[0] ?? 0;
  const targetSpeed0 = s.speed[1] ?? 0;
  let fired = false;
  let casterSpeed = 0;
  let targetSpeed = 0;
  let healed = 0;
  let targetFrozen = false;
  let casterTranslucent = false;
  for (let t = 0; t < PROBE_TICKS; t++) {
    step(world, [bitOf(slot), NO_COMMAND]);
    healed = Math.max(healed, (s.hp.at(0) ?? 0) - 50);
    fired ||= spawned(world) || s.status.some((v) => v !== 0) || (s.teams[TEAM_COOLDOWNS + slot] ?? 0) > 0;
    casterSpeed = Math.max(casterSpeed, (s.speed[0] ?? 0) - casterSpeed0);
    targetSpeed = Math.min(targetSpeed, (s.speed[1] ?? 0) - targetSpeed0);
    targetFrozen ||= ((s.flags[1] ?? 0) & EntityFlag.frozen) !== 0;
    casterTranslucent ||= ((s.flags[0] ?? 0) & EntityFlag.translucent) !== 0;
  }
  return {
    race,
    slot,
    ability: CHARACTERS.find((c) => c.id === race)?.abilities[slot] ?? '',
    fired,
    targetDamage: Math.max(0, TARGET_HP - (s.hp[1] ?? 0)),
    casterHeal: healed,
    casterSpeedDelta: casterSpeed,
    targetSpeedDelta: targetSpeed,
    targetFrozen,
    casterTranslucent,
  };
}

/** Damage the caster takes from one dummy Stick (base 10) after pressing `slot` on tick 0; 10 means no mitigation. */
export function damageTakenAfterCasting(race: string, slot: 0 | 1): number {
  const world = setup(race, 120);
  const s = world.state;
  const hp0 = s.hp[0] ?? 0;
  for (let t = 0; t < 40; t++) step(world, [t === 0 ? bitOf(slot) : NO_COMMAND, t === 0 ? Cmd.primary : NO_COMMAND]);
  return hp0 - (s.hp[0] ?? 0);
}
