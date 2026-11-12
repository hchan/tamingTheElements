import { CHARACTER_HEIGHT, CHARACTER_WIDTH } from './chapters';
import { CHARACTERS } from './characters';

/**
 * Giant heroes (ideas/in-progress/giant-heroes-size-for-speed.md): a per-character integer size in percent (100 = 1x).
 * Arcade only: Classic ignores it, so Classic hashes are untouched. A bigger hero has a larger hitbox and hurtbox, more
 * life, harder hits and more knockback weight, and walks and dashes slower. Sim data (changing a value bumps SIM_VERSION).
 * Integer maths only: every curve below is linear in `size - 100`, in per mille, so no `pow`/`exp` is needed.
 */
export const SIZE_ONE = 100;
export const SIZE_MAX = 400;

/** Characters not listed are 1x. */
export const CHARACTER_SIZE: Readonly<Record<string, number>> = {
  rokcore: 200,
};

/** Per 1x of extra size (`size - 100` = 100): life +450 pm, damage +120 pm, knockback weight +600 pm, walk and dash speed -280 pm. */
export const SIZE_LIFE_PM_PER_STEP = 450;
export const SIZE_DAMAGE_PM_PER_STEP = 120;
export const SIZE_WEIGHT_PM_PER_STEP = 600;
export const SIZE_SPEED_PM_PER_STEP = 280;
/** The slowest a giant gets, in pm of its base speed. */
export const SIZE_SPEED_FLOOR_PM = 300;

/** Size of a character slug in percent (100 when not listed), clamped to 100..SIZE_MAX. */
export function sizeOfSlug(slug: string): number {
  return Math.min(Math.max(CHARACTER_SIZE[slug] ?? SIZE_ONE, SIZE_ONE), SIZE_MAX);
}

function stepsPm(size: number): number {
  return (size - SIZE_ONE) * 10; // per mille of one extra 1x
}

/** Life multiplier in pm (1000 at 1x). */
export function sizeLifePm(size: number): number {
  return 1000 + Math.floor((stepsPm(size) * SIZE_LIFE_PM_PER_STEP) / 1000);
}
/** Damage multiplier in pm (1000 at 1x). */
export function sizeDamagePm(size: number): number {
  return 1000 + Math.floor((stepsPm(size) * SIZE_DAMAGE_PM_PER_STEP) / 1000);
}
/** Knockback weight in pm (1000 at 1x): the knockback speed a hit gives is divided by it. */
export function sizeWeightPm(size: number): number {
  return 1000 + Math.floor((stepsPm(size) * SIZE_WEIGHT_PM_PER_STEP) / 1000);
}
/** Walk and dash speed multiplier in pm (1000 at 1x), floored at SIZE_SPEED_FLOOR_PM. */
export function sizeSpeedPm(size: number): number {
  return Math.max(SIZE_SPEED_FLOOR_PM, 1000 - Math.floor((stepsPm(size) * SIZE_SPEED_PM_PER_STEP) / 1000));
}
/** Body box edge in px at `size` (floored). */
export function sizeWidthPx(size: number): number {
  return Math.floor((CHARACTER_WIDTH * size) / SIZE_ONE);
}
export function sizeHeightPx(size: number): number {
  return Math.floor((CHARACTER_HEIGHT * size) / SIZE_ONE);
}

const SIZE_BY_DEF: readonly number[] = CHARACTERS.map((c) => sizeOfSlug(c.id));
/** Size of the character with `CHARACTERS` index `defIdx` (`SimState.defId` of a character entity). */
export function sizeOfDef(defIdx: number): number {
  return SIZE_BY_DEF[defIdx] ?? SIZE_ONE;
}
