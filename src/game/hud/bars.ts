import type { Element, RenderCharacter, RenderView } from '@core/index';
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

export type HealthState = 'healthy' | 'hurt' | 'critical';

/** At or below this fraction a hero is critical (the same 25% line that makes an opponent capturable). */
export const CRITICAL_AT = 0.25;
export const HURT_BELOW = 0.5;

/** Colour-blind-safe (Okabe-Ito) fills used by the high-contrast option. */
export const HC_COLORS: Readonly<Record<HealthState, number>> = {
  healthy: 0x56b4e9,
  hurt: 0xf0e442,
  critical: 0xd55e00,
};

export function healthState(fraction: number): HealthState {
  const p = Number.isNaN(fraction) ? 1 : fraction;
  if (p <= CRITICAL_AT) return 'critical';
  return p < HURT_BELOW ? 'hurt' : 'healthy';
}

/**
 * Health is never shown by colour alone: every state also has a label and a stroke pattern
 * (solid, long dashes, short dashes), so it reads without telling red from green.
 */
export interface HealthCue {
  readonly state: HealthState;
  readonly label: string;
  /** Dash on/off lengths in px, or null for a solid stroke. */
  readonly dash: readonly [number, number] | null;
  /** Text such as `72% OK` for the HUD and for assistive text. */
  readonly text: string;
}

const CUES: Readonly<Record<HealthState, Pick<HealthCue, 'label' | 'dash'>>> = {
  healthy: { label: 'OK', dash: null },
  hurt: { label: 'HURT', dash: [16, 6] },
  critical: { label: 'LOW', dash: [6, 4] },
};

export function healthCue(fraction: number): HealthCue {
  const state = healthState(fraction);
  const pct = Math.ceil(clamp01(fraction) * 100);
  return { state, ...CUES[state], text: `${String(pct)}% ${CUES[state].label}` };
}

function clamp01(f: number): number {
  return Number.isNaN(f) ? 1 : Math.min(1, Math.max(0, f));
}

/** Fill colour for a health fraction: the legacy ramp, or the colour-blind-safe palette in high contrast. */
export function healthFill(fractionValue: number, highContrast: boolean): number {
  return highContrast ? HC_COLORS[healthState(fractionValue)] : getHealthColor(fractionValue);
}

/** Splits [fromX, toX] into stroke segments for a dash pattern (one solid segment when `dash` is null). */
export function dashSegments(fromX: number, toX: number, dash: readonly [number, number] | null): [number, number][] {
  if (toX <= fromX) return [];
  if (dash === null) return [[fromX, toX]];
  const out: [number, number][] = [];
  const [on, off] = dash;
  for (let x = fromX; x < toX; x += on + off) out.push([x, Math.min(toX, x + on)]);
  return out;
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
export function barFill(
  g: BarGeometry,
  hp: number,
  maxHp: number,
  restCap: number,
  highContrast = false,
): BarFill {
  const span = g.maxX - g.minX;
  const cur = fraction(hp, maxHp);
  return {
    restX: Math.ceil(span * fraction(restCap, maxHp) + g.minX),
    curX: Math.ceil(span * cur + g.minX),
    color: healthFill(cur, highContrast),
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

/** Arcade active-hero avatar: a square this size, flush with the main bar's end and top edge (`arcadeAvatar`). */
export const AVATAR_SIZE = 32;
const AVATAR_GAP = 4;

/**
 * Where the active hero's avatar goes in the Arcade HUD: on the outer end of its main bar (left of the player's, right of
 * the enemy's) with the same gap on both sides, its top edge level with the bar's top edge, so it reads as the bar's
 * head. The right one stays clear of the fullscreen button's column.
 */
export function arcadeAvatar(team: number): { readonly x: number; readonly y: number; readonly size: number } {
  const bar = mainBar(sideOffset(team));
  const y = bar.y - bar.line / 2;
  return { x: team === 0 ? bar.minX - AVATAR_GAP - AVATAR_SIZE : bar.maxX + AVATAR_GAP, y, size: AVATAR_SIZE };
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
  readonly element: Element;
  readonly hp: number;
  readonly maxHp: number;
  readonly restCap: number;
  readonly dead: boolean;
  readonly benched: boolean;
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
    element: c.element,
    hp: c.hp,
    maxHp: c.maxHp,
    restCap: c.restCap,
    dead: (c.flags & EntityFlag.dead) !== 0,
    benched: (c.flags & EntityFlag.benched) !== 0,
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

/** Classic bar chrome (presentation): fill shades from one base colour, so the bar has a lit top edge and a shaded foot. */
export function shade(color: number, factor: number): number {
  const ch = (v: number): number => Math.min(255, Math.max(0, Math.round(v * factor)));
  return (ch((color >> 16) & 0xff) << 16) | (ch((color >> 8) & 0xff) << 8) | ch(color & 0xff);
}

/** Pulse (0..1) of the critical-health border; a steady 1 with reduced motion. */
export function criticalPulse(timeMs: number, reduced: boolean): number {
  if (reduced) return 1;
  const t = (timeMs % 700) / 700;
  return 0.45 + 0.55 * (t < 0.5 ? t * 2 : 2 - t * 2);
}

/** Rest heal (sim `restSystem`): a benched, living character heals 0.5% of max health every second up to its rest cap. */
export const REST_HEAL_PER_SEC = 0.005;

/** `healing` on the bench below its cap, `capped` on the bench at its cap, `inPlay` for the fighter (no regen), `none` when knocked out. */
export type RegenState = 'healing' | 'capped' | 'inPlay' | 'none';

export function regenState(c: Pick<HudCharacter, 'dead' | 'benched' | 'hp' | 'restCap'>): RegenState {
  if (c.dead) return 'none';
  if (!c.benched) return 'inPlay';
  return c.hp < c.restCap ? 'healing' : 'capped';
}

/** Health per second a healing benched character gains, rounded to one decimal. */
export function regenPerSec(maxHp: number): number {
  return Math.round(maxHp * REST_HEAL_PER_SEC * 10) / 10;
}

/** Text beside a bench bar: the live rate while healing, `FULL` at the cap. */
export function regenLabel(c: Pick<HudCharacter, 'dead' | 'benched' | 'hp' | 'restCap' | 'maxHp'>): string {
  const st = regenState(c);
  if (st === 'healing') return `+${String(regenPerSec(c.maxHp))}/s`;
  return st === 'capped' ? 'rested' : '';
}

/** Percent of max health the fighter can recover to on the bench (its rest cap). */
/**
 * The words beside the active hero's main bar: its name on the first line (so the avatar is never anonymous), then the health
 * state; the Classic HUD adds the rest cap. `name` comes from `heroName(sprite)`.
 */
export function activeHeroText(name: string, c: Pick<HudCharacter, 'hp' | 'maxHp' | 'restCap'>, classic: boolean): string {
  const health = healthCue(c.hp / Math.max(1, c.maxHp)).text;
  return classic ? `${name}\nHP ${health}\ncap ${String(restCapPct(c))}%` : `${name}\n${health}`;
}

export function restCapPct(c: Pick<HudCharacter, 'restCap' | 'maxHp'>): number {
  return Math.round(fraction(c.restCap, c.maxHp) * 100);
}
