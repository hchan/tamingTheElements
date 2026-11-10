import { CHARACTERS } from '../data/characters';
import type { Element } from '../data/elements';
import { EntityFlag, EntityKind, MAX_ENTITIES, World } from './state';
import { listStatuses } from './systems/status';
import { ABILITY_DEFS } from './systems/projectile';
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

/** Read-only facade over a SimWorld for the renderer. Never exposes the sim arrays. */
export interface RenderView {
  readonly tick: number;
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
