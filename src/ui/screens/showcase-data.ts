/**
 * Main-menu showcase data (WP M1): which heroes can stand behind the menu, how big, and the seeded picker. Keyed by sprite file stem, imports
 * nothing from core and is not sim code (the seed only decides a decoration). Sizes follow the owner's brief: dragons largest, Wispera tiny.
 */

export type ShowcaseElement = 'fire' | 'water' | 'earth' | 'air' | 'void';
export type ShowcaseSize = 'dragon' | 'large' | 'medium' | 'small';
export type SlotKind = 'ground' | 'floater';

export interface ShowcaseHero {
  readonly sprite: string;
  readonly element: ShowcaseElement;
  readonly size: ShowcaseSize;
  /** Trimmed image width / height (never stretch). The owner's originals are 400x400 squares. */
  readonly aspect: number;
  /** Where the feet touch, 0..1 inside the image (x, y). */
  readonly feet: readonly [number, number];
  readonly facing: 'right' | 'front';
  readonly motion: 'stand' | 'dragon' | 'float';
}

/** Height multiplier against a large hero (CSS reads it as --sc-k). */
export const SIZE_SCALE: Readonly<Record<ShowcaseSize, number>> = { dragon: 1.25, large: 1, medium: 0.85, small: 0.4 };

const h = (
  sprite: string,
  element: ShowcaseElement,
  size: ShowcaseSize,
  feetY: number,
  facing: 'right' | 'front',
  motion: ShowcaseHero['motion'],
): ShowcaseHero => ({ sprite, element, size, aspect: 1, feet: [0.5, feetY], facing, motion });

export const SHOWCASE_HEROES: readonly ShowcaseHero[] = [
  h('sindarosa', 'fire', 'dragon', 0.99, 'right', 'dragon'),
  h('curomo', 'water', 'dragon', 0.99, 'right', 'dragon'),
  h('fiara', 'fire', 'dragon', 0.98, 'front', 'dragon'),
  h('pax', 'earth', 'large', 1, 'front', 'stand'),
  h('rokcore', 'earth', 'large', 1, 'front', 'stand'),
  h('treenoc', 'earth', 'large', 1, 'front', 'stand'),
  h('eternalVoid', 'void', 'large', 1, 'front', 'float'),
  h('lavax', 'fire', 'medium', 1, 'front', 'stand'),
  h('ishimi', 'water', 'medium', 1, 'front', 'stand'),
  h('morblass', 'water', 'medium', 1, 'front', 'stand'),
  h('echo', 'air', 'medium', 0.96, 'front', 'float'),
  h('cyclonius', 'air', 'medium', 0.98, 'front', 'float'),
  h('wispera', 'air', 'small', 0.81, 'front', 'float'),
];

export interface ShowcasePick {
  readonly hero: ShowcaseHero;
  readonly slot: SlotKind;
  /** Mirror the image (so a right-facing hero looks toward the buttons). */
  readonly flip: boolean;
  /** 0..1 start offset, for the idle motion. */
  readonly phase: number;
}

/** mulberry32: tiny seeded generator for decoration only. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks one hero per slot, in slot order. No hero twice; at most one dragon; Wispera only in a floater slot (which never holds a dragon);
 * with 4 slots or fewer every hero has a different element while one is free. Ground slot 0 is the left flank, 1 the right (flip points
 * a right-facing hero toward the buttons).
 */
export function pickShowcase(seed: number, slots: readonly SlotKind[]): ShowcasePick[] {
  const rnd = mulberry32(seed);
  const usedEl = new Set<ShowcaseElement>();
  const used = new Set<string>();
  let dragons = 0;
  let ground = 0;
  const strict = slots.length <= 4;
  // Ground slots choose first so floaters cannot starve them of elements.
  const picks: ShowcasePick[] = new Array<ShowcasePick>(slots.length);
  const order = [...slots.keys()].sort((a, b) => Number(slots[a] === 'floater') - Number(slots[b] === 'floater') || a - b);
  for (const i of order) {
    const slot = slots[i] as SlotKind;
    const legal = (c: ShowcaseHero): boolean =>
      !used.has(c.sprite) &&
      (slot === 'floater' ? c.size !== 'dragon' : c.sprite !== 'wispera') &&
      !(c.size === 'dragon' && dragons > 0);
    let pool = SHOWCASE_HEROES.filter((c) => legal(c) && !(strict && usedEl.has(c.element)));
    if (pool.length === 0) pool = SHOWCASE_HEROES.filter(legal);
    if (slot === 'floater' && rnd() < 0.5 && pool.some((c) => c.sprite === 'wispera')) pool = pool.filter((c) => c.sprite === 'wispera');
    const hero = pool[Math.floor(rnd() * pool.length)] as ShowcaseHero;
    used.add(hero.sprite);
    usedEl.add(hero.element);
    if (hero.size === 'dragon') dragons++;
    const rightSide = slot === 'ground' && ground++ % 2 === 1;
    const coin = rnd() < 0.5;
    picks[i] = { hero, slot, flip: hero.facing === 'right' ? rightSide : coin, phase: rnd() };
  }
  return picks;
}
