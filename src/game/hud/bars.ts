import type { RenderCharacter, RenderView } from '@core/index';
import { EntityFlag } from '@core/index';

/**
 * Pure HUD geometry and data (no Phaser). Geometry is legacy `topHUD.js` at the 1280 logical width:
 * hud_height 100 (legacy: playerCharacter.height * 1.25), one half-width block per side.
 * Intentional divergence: the HUD only reads; legacy `refresh()` called `character.die()` from the
 * draw loop when health reached 0. Death is decided in the sim (see systems/death).
 */
export const HUD_WIDTH = 1280;
export const HUD_HEIGHT = 100;
export const BAR_LINE = 10;
export const BAR_LINE_MAX = BAR_LINE + 1;
export const BAR_TOP_PADDING = 10;
export const BENCH_SPRITE = (HUD_HEIGHT - BAR_LINE - BAR_TOP_PADDING) / 2;
export const BENCH_LINE_MAX = BAR_LINE_MAX - 4;
export const BENCH_LINE = BENCH_LINE_MAX - 1;
export const MAX_COLOR = 0x000000;
export const REST_COLOR = 0xaaaaaa;

/** Legacy `getHealthColor`: green to yellow down to 50%, then yellow to red. NaN counts as full. */
export function getHealthColor(fraction: number): number {
  const p = Number.isNaN(fraction) ? 1 : fraction;
  if (p >= 0.5) return (Math.ceil((1 - p) * 255 * 2) << 16) | 0x00ff00;
  return 0xff0000 | (Math.ceil(p * 255 * 2) << 8);
}

/** Health as a 0..1 fraction (0 when maxHp is not positive), clamped. */
export function fraction(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export interface BarGeometry {
  /** Left and right ends of the full-length bar track and its y. */
  readonly minX: number;
  readonly maxX: number;
  readonly y: number;
  readonly lineMax: number;
  readonly line: number;
}

export interface BarFill {
  /** Right end of the rest ceiling stroke and of the health stroke (equal to minX when empty). */
  readonly restX: number;
  readonly curX: number;
  readonly color: number;
}

/** Legacy `Math.ceil((max - min) * fraction + min)` for the rest and current strokes. */
export function barFill(g: BarGeometry, hp: number, maxHp: number, restCap: number): BarFill {
  const span = g.maxX - g.minX;
  const cur = fraction(hp, maxHp);
  return {
    restX: Math.ceil(span * fraction(restCap, maxHp) + g.minX),
    curX: Math.ceil(span * cur + g.minX),
    color: getHealthColor(cur),
  };
}

/** Left edge of a side's block: team 0 on the left half, team 1 on the right half. */
export function sideOffset(team: number): number {
  return team === 0 ? 0 : HUD_WIDTH / 2;
}

export function mainBar(xOffset: number): BarGeometry {
  return {
    minX: HUD_HEIGHT * 1.2 + xOffset,
    maxX: HUD_HEIGHT * 1.2 + xOffset + (HUD_WIDTH - 4 * HUD_HEIGHT) / 2,
    y: BAR_TOP_PADDING,
    lineMax: BAR_LINE_MAX,
    line: BAR_LINE,
  };
}

/** Bench row `i` (0-based): avatar slot at x_offset + 2*hud_height, bar starts after the avatar. */
export function benchBar(xOffset: number, i: number): BarGeometry {
  const main = mainBar(xOffset);
  const spriteX = xOffset + HUD_HEIGHT * 2;
  const spriteY = BAR_LINE + BAR_TOP_PADDING + i * BENCH_SPRITE;
  return {
    minX: spriteX + BENCH_SPRITE + BENCH_LINE,
    maxX: main.maxX,
    y: spriteY + BENCH_LINE,
    lineMax: BENCH_LINE_MAX,
    line: BENCH_LINE,
  };
}

export interface HudCharacter {
  readonly id: number;
  readonly sprite: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly restCap: number;
  readonly dead: boolean;
}

export interface HudSide {
  readonly team: number;
  readonly active: HudCharacter | undefined;
  /** Benched (and dead) teammates in entity id order. */
  readonly bench: readonly HudCharacter[];
}

function copy(c: RenderCharacter): HudCharacter {
  return {
    id: c.id,
    sprite: c.sprite,
    hp: c.hp,
    maxHp: c.maxHp,
    restCap: c.restCap,
    dead: (c.flags & EntityFlag.dead) !== 0,
  };
}

/** Reads one side's active character and bench out of the RenderView. */
export function collectSide(view: RenderView, team: number): HudSide {
  let active: HudCharacter | undefined;
  const bench: HudCharacter[] = [];
  view.forEachCharacter((c) => {
    if (c.team !== team) return;
    if ((c.flags & (EntityFlag.benched | EntityFlag.dead)) === 0) active ??= copy(c);
    else bench.push(copy(c));
  });
  return { team, active, bench };
}
