export const ELEMENTS = ['fire', 'air', 'earth', 'water', 'void'] as const;
export type Element = (typeof ELEMENTS)[number];

export type ElementRelation = 'adv' | 'dis' | 'neutral';

/** BEATS[x] is the element that x has advantage over (fire<-water means water beats fire). */
export const BEATS: Readonly<Partial<Record<Element, Element>>> = {
  water: 'fire',
  earth: 'water',
  air: 'earth',
  fire: 'air',
};

/** Relation of an attacker's element to a defender's element. */
export function elementRelation(att: Element, def: Element): ElementRelation {
  if (BEATS[att] === def) return 'adv';
  if (BEATS[def] === att) return 'dis';
  return 'neutral';
}
