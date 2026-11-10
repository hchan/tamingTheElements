import { CHARACTERS } from '../data/characters';
import type { Element } from '../data/elements';
import type { AbilityDef } from '../data/types';
import { capturable } from '../rules/progression';
import {
  EntityFlag, EntityKind, MAX_ENTITIES, TEAM_COOLDOWNS, TEAM_STRIDE, TeamField, World,
} from './state';
import { CAPTURE_GRANTED_BIT } from './systems/capture';
import { controlledId } from './systems/movement';
import { listStatuses } from './systems/status';
import { ABILITY_DEFS } from './systems/projectile';
import { SWAP_COOLDOWN_TICKS, teamMembers } from './systems/swap';

/** Capture sits after the character's own two ability slots (see systems/capture.ts). */
const CAPTURE_SLOT = 2;
import type { SimWorld } from './world';

/** One character as the renderer sees it. The object is reused between callbacks: copy what you keep. */
export interface RenderCharacter {
  id: number;
  team: number;
  /** Character sprite key (legacy map sprite name). */
  sprite: string;
  /** 0..7 clockwise from east (0 = east, 4 = west). */
  dir: number;
  flags: number;
  x: number;
  y: number;
  px: number;
  py: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  /** Rest ceiling: benched characters heal up to this. */
  restCap: number;
}

/** One active status as the HUD sees it. The object is reused between callbacks. */
export interface RenderStatus {
  /** StatusId value. */
  id: number;
  startTick: number;
  expireTick: number;
}

/** One projectile as the renderer sees it. The object is reused between callbacks: copy what you keep. */
export interface RenderProjectile {
  id: number;
  team: number;
  /** Ability sprite key (`sprite:<key>` texture). */
  sprite: string;
  /** 0..7 clockwise from east; rotation is dir * 45 degrees. */
  dir: number;
  x: number;
  y: number;
  px: number;
  py: number;
  w: number;
  h: number;
}

/** One ability slot of the action bar. `readyTick` is the first tick the slot can fire again. */
export interface RenderActionSlot {
  /** Ability sprite key (`sprite:<key>` texture). */
  sprite: string;
  readyTick: number;
  cooldownTicks: number;
}

/** One teammate swap slot: the character sprite and whether it can no longer be swapped to. */
export interface RenderSwapSlot {
  sprite: string;
  dead: boolean;
}

/** Action bar data for one team's active character; a snapshot, safe to keep. */
export interface RenderActionBar {
  tick: number;
  /** The character's own ability slots (primary, secondary). */
  abilities: RenderActionSlot[];
  /** Capture slot, or undefined when not granted (chapter 1) or for the AI side. */
  capture: (RenderActionSlot & { capturable: boolean }) | undefined;
  swaps: RenderSwapSlot[];
  swapReadyTick: number;
  swapCooldownTicks: number;
}

/** Read-only facade over a SimWorld for the renderer. Never exposes the sim arrays. */
export interface RenderView {
  readonly tick: number;
  /** Action bar of the team's active character, or undefined when the team has none. */
  actionBar(team: number): RenderActionBar | undefined;
  /** Visits the active statuses of one entity in slot order. */
  forEachStatus(id: number, visit: (st: RenderStatus) => void): void;
  /** Visits every live projectile entity. */
  forEachProjectile(visit: (p: RenderProjectile) => void): void;
  /** Element of the first player-side character (picks the background), or undefined with no heroes. */
  heroElement(): Element | undefined;
  /** Visits every live character entity (benched and dead included; check `flags`). */
  forEachCharacter(visit: (c: RenderCharacter) => void): void;
}

export function createRenderView(world: SimWorld): RenderView {
  const s = world.state;
  const scratch: RenderCharacter = { id: 0, team: 0, sprite: '', dir: 0, flags: 0, x: 0, y: 0, px: 0, py: 0, w: 0, h: 0, hp: 0, maxHp: 0, restCap: 0 };
  const status: RenderStatus = { id: 0, startTick: 0, expireTick: 0 };
  const pScratch: RenderProjectile = { id: 0, team: 0, sprite: '', dir: 0, x: 0, y: 0, px: 0, py: 0, w: 0, h: 0 };
  const isCharacter = (i: number): boolean =>
    s.kind[i] === EntityKind.character && ((s.flags[i] ?? 0) & EntityFlag.alive) !== 0;
  return {
    get tick(): number {
      return s.world[World.tick] ?? 0;
    },
    actionBar(team): RenderActionBar | undefined {
      const cur = controlledId(world, team);
      if (cur < 0) return undefined;
      const tick = s.world[World.tick] ?? 0;
      const base = team * TEAM_STRIDE;
      const slotOf = (def: AbilityDef | undefined, slot: number): RenderActionSlot => ({
        sprite: def?.sprite ?? '',
        readyTick: s.teams[base + TEAM_COOLDOWNS + slot] ?? 0,
        cooldownTicks: def?.cooldownTicks ?? 0,
      });
      const ids = CHARACTERS[s.defId[cur] ?? 0]?.abilities ?? [];
      const abilities = ids.map((a, i) => slotOf(ABILITY_DEFS.find((d) => d.id === a), i));
      let capture: RenderActionBar['capture'];
      const enemy = controlledId(world, 1 - team);
      if (team === 0 && ((s.world[World.flags] ?? 0) & CAPTURE_GRANTED_BIT) !== 0) {
        capture = {
          ...slotOf(ABILITY_DEFS.find((d) => d.id === 'capture'), CAPTURE_SLOT),
          capturable: enemy >= 0 && capturable(s.hp[enemy] ?? 0, s.maxHp[enemy] ?? 0),
        };
      }
      const swaps = teamMembers(world, team)
        .filter((m) => m !== cur)
        .map((m) => ({
          sprite: CHARACTERS[s.defId[m] ?? 0]?.sprite ?? '',
          dead: ((s.flags[m] ?? 0) & EntityFlag.dead) !== 0,
        }));
      return {
        tick,
        abilities,
        capture,
        swaps,
        swapReadyTick: s.teams[base + TeamField.swapCooldownUntil] ?? 0,
        swapCooldownTicks: SWAP_COOLDOWN_TICKS,
      };
    },
    forEachProjectile(visit): void {
      for (let i = 0; i < MAX_ENTITIES; i++) {
        if (s.kind[i] !== EntityKind.projectile || ((s.flags[i] ?? 0) & EntityFlag.alive) === 0) continue;
        pScratch.id = i;
        pScratch.team = s.team[i] ?? 0;
        pScratch.sprite = ABILITY_DEFS[s.defId[i] ?? 0]?.sprite ?? '';
        pScratch.dir = s.dir[i] ?? 0;
        pScratch.x = s.x[i] ?? 0;
        pScratch.y = s.y[i] ?? 0;
        pScratch.px = s.px[i] ?? 0;
        pScratch.py = s.py[i] ?? 0;
        pScratch.w = s.w[i] ?? 0;
        pScratch.h = s.h[i] ?? 0;
        visit(pScratch);
      }
    },
    heroElement(): Element | undefined {
      for (let i = 0; i < MAX_ENTITIES; i++) {
        if (isCharacter(i) && s.team[i] === 0) return CHARACTERS[s.defId[i] ?? 0]?.element;
      }
      return undefined;
    },
    forEachCharacter(visit): void {
      for (let i = 0; i < MAX_ENTITIES; i++) {
        if (!isCharacter(i)) continue;
        scratch.id = i;
        scratch.team = s.team[i] ?? 0;
        scratch.sprite = CHARACTERS[s.defId[i] ?? 0]?.sprite ?? '';
        scratch.dir = s.dir[i] ?? 0;
        scratch.flags = s.flags[i] ?? 0;
        scratch.x = s.x[i] ?? 0;
        scratch.y = s.y[i] ?? 0;
        scratch.px = s.px[i] ?? 0;
        scratch.py = s.py[i] ?? 0;
        scratch.w = s.w[i] ?? 0;
        scratch.h = s.h[i] ?? 0;
        scratch.hp = s.hp[i] ?? 0;
        scratch.maxHp = s.maxHp[i] ?? 0;
        scratch.restCap = s.restCap[i] ?? 0;
        visit(scratch);
      }
    },
    forEachStatus(id, visit): void {
      for (const st of listStatuses(s, id)) {
        status.id = st.id;
        status.startTick = st.startTick;
        status.expireTick = st.expireTick;
        visit(status);
      }
    },
  };
}
