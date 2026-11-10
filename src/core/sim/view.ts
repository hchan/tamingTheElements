import { CHARACTERS } from '../data/characters';
import type { Element } from '../data/elements';
import { EntityFlag, EntityKind, MAX_ENTITIES, World } from './state';
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
}

/** Read-only facade over a SimWorld for the renderer. Never exposes the sim arrays. */
export interface RenderView {
  readonly tick: number;
  /** Element of the first player-side character (picks the background), or undefined with no heroes. */
  heroElement(): Element | undefined;
  /** Visits every live character entity (benched and dead included; check `flags`). */
  forEachCharacter(visit: (c: RenderCharacter) => void): void;
}

export function createRenderView(world: SimWorld): RenderView {
  const s = world.state;
  const scratch: RenderCharacter = { id: 0, team: 0, sprite: '', dir: 0, flags: 0, x: 0, y: 0, px: 0, py: 0, w: 0, h: 0 };
  const isCharacter = (i: number): boolean =>
    s.kind[i] === EntityKind.character && ((s.flags[i] ?? 0) & EntityFlag.alive) !== 0;
  return {
    get tick(): number {
      return s.world[World.tick] ?? 0;
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
        visit(scratch);
      }
    },
  };
}
