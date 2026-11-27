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
/**
 * The smallest size (roster WP 0.3: wisps and Kindrel, sizes 60-70). Below SIZE_ONE every curve below continues
 * linearly through 1x (all integer, floored): at size 60 (`size - 100` = -40) life x0.82, damage x0.952, knockback weight
 * x0.76 (it is knocked back further), walk and dash speed x1.112, Snag root x1.1. SIZE_MIN keeps them positive and sane
 * (at 50: life x0.775, weight x0.7, speed x1.14). Arcade life is `arcadeLifePm` (race pm, roster tag-team pm) times
 * `sizeLifePm`, so a small hero's life = base x race pm x this curve.
 */
export const SIZE_MIN = 50;

/** Characters not listed are 1x. */
export const CHARACTER_SIZE: Readonly<Record<string, number>> = {
  rokcore: 200,
  // A 1.5x mid-size bruiser: +22% life, +6% damage, knockback / 1.3, walk and dash x0.86.
  ishimi: 150,
  // Roster-24 batch 1: a small cinder fox, a medium kelpie, a large siege crab, a medium tall jelly (box below).
  kindrel: 70,
  nykra: 110,
  quarrak: 170,
  hyalia: 100,
  // Batch 2: a hulking forge boar, a small anglerfish, a medium armoured boar, a tiny storm-wisp.
  brazgor: 160,
  glimmaw: 90,
  durrok: 120,
  zephra: 60,
  // Batch 3: a long fire wyrm (box below), a huge kraken, a medium raptor, a medium fungus.
  ouroth: 100,
  abyssor: 170,
  vortigal: 150,
  umbrel: 110,
};

/**
 * Non-square bodies (roster WP 0.3): `[width, height]` in px at 1x, for characters whose box is not the 80x80
 * CHARACTER_WIDTH x CHARACTER_HEIGHT square (a long wyrm 200x90, a tall jelly 100x160). The `size` percent scales both edges
 * on top of it. Not listed = the square. Arcade only, like size. The box keeps the same centre as a 1x hero at spawn and tag.
 */
export const CHARACTER_BOX: Readonly<Record<string, readonly [number, number]>> = {
  hyalia: [100, 160],
  ouroth: [200, 90],
};

/** Per 1x of extra size (`size - 100` = 100): life +450 pm, damage +120 pm, knockback weight +600 pm, walk and dash speed -280 pm. */
export const SIZE_LIFE_PM_PER_STEP = 450;
export const SIZE_DAMAGE_PM_PER_STEP = 120;
export const SIZE_WEIGHT_PM_PER_STEP = 600;
export const SIZE_SPEED_PM_PER_STEP = 280;
/** The slowest a giant gets, in pm of its base speed. */
export const SIZE_SPEED_FLOOR_PM = 300;

/** Snag root length multiplier in pm (1000 at 1x): a giant slips the rope sooner (-250 pm per extra 1x, floored at 400). */
export const SIZE_ROOT_PM_PER_STEP = 250;
export const SIZE_ROOT_FLOOR_PM = 400;

/** Size of a character slug in percent (100 when not listed), clamped to SIZE_MIN..SIZE_MAX. */
export function sizeOfSlug(slug: string): number {
  return Math.min(Math.max(CHARACTER_SIZE[slug] ?? SIZE_ONE, SIZE_MIN), SIZE_MAX);
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
export function sizeRootPm(size: number): number {
  return Math.max(SIZE_ROOT_FLOOR_PM, 1000 - Math.floor((stepsPm(size) * SIZE_ROOT_PM_PER_STEP) / 1000));
}
/** Body box edge in px at `size` (floored), for the square 80x80 box. */
export function sizeWidthPx(size: number): number {
  return Math.floor((CHARACTER_WIDTH * size) / SIZE_ONE);
}
export function sizeHeightPx(size: number): number {
  return Math.floor((CHARACTER_HEIGHT * size) / SIZE_ONE);
}

/** Body box `[w, h]` in px of character `slug`: its CHARACTER_BOX (or the square) scaled by its size, floored. */
export function boxOfSlug(slug: string): readonly [number, number] {
  const size = sizeOfSlug(slug);
  const [bw, bh] = CHARACTER_BOX[slug] ?? [CHARACTER_WIDTH, CHARACTER_HEIGHT];
  return [Math.floor((bw * size) / SIZE_ONE), Math.floor((bh * size) / SIZE_ONE)];
}

// Looked up live (spawn, tag and hit time only, never per entity per tick) so a test can register a hero.
/** Size of the character with `CHARACTERS` index `defIdx` (`SimState.defId` of a character entity). */
export function sizeOfDef(defIdx: number): number {
  const c = CHARACTERS[defIdx];
  return c === undefined ? SIZE_ONE : sizeOfSlug(c.id);
}
/** Body box `[w, h]` in px of the character with `CHARACTERS` index `defIdx` (see boxOfSlug). */
export function boxOfDef(defIdx: number): readonly [number, number] {
  const c = CHARACTERS[defIdx];
  return c === undefined ? [CHARACTER_WIDTH, CHARACTER_HEIGHT] : boxOfSlug(c.id);
}

/**
 * Drawn overhang allowance (SIM_VERSION 121, Arcade Hard AI melee wall hold only): integer px per side that a melee hero's art is
 * wider than its sim box (the view draws at `arcadeHeroScale`). Measured idle overhang per side (opaque alpha >= 32, widest idle
 * frame; left/right): curomo 40/35, pax 39/38, treenoc 38/35, echo 40/39, wispera 34/25, kindrel 38/37, nykra 37/37, brazgor 34/32,
 * durrok 44/45, ouroth 69/69, abyssor 20/21, vortigal 39/41. FIRST GUESS = 50% of that: the wall clamp (`boxSpanX`) already hides
 * the pinned foe's overhang, and the worst attack frames are brief. Refit (MEASUREMENT, wall-pin probe, level 4, 16 seeds): the median wall gap moves about 1.0x the applied
 * extra for curomo, wispera and brazgor; brazgor's drawn overlap was still 12.4% at 17, so it is now 22 (x1.3). ouroth, durrok, vortigal, pax and
 * echo do not improve with a bigger extra (ideas/brainstorm/wall-hold-*.md), so their rows stay.
 * Ranged heroes and unlisted ones are 0. Sim data (changing a value bumps SIM_VERSION).
 */
export const CHARACTER_DRAWN_EXTRA_PX: Readonly<Record<string, number>> = {
  curomo: 19,
  pax: 19,
  treenoc: 18,
  echo: 20,
  wispera: 15,
  kindrel: 19,
  nykra: 18,
  brazgor: 22,
  durrok: 22,
  ouroth: 35,
  abyssor: 10,
  vortigal: 20,
};

/** Drawn overhang allowance in px per side of character `slug` (0 when not listed). */
export function drawnExtraOfSlug(slug: string): number {
  return CHARACTER_DRAWN_EXTRA_PX[slug] ?? 0;
}
