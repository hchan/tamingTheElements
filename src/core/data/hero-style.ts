import type { CharacterId } from './ids';

export type HeroStyle = 'melee' | 'ranged';

/**
 * Single source of truth for a hero's fighting style (roster-24 plan section 2.2). Void and dummy are excluded.
 * Report-only for now: the sim's `RANGED` flag (`systems/arcade/meter.ts`) still derives from the first ability until WP 0.4
 * aligns it; the UI, the balance tools and the style gates read this table.
 * Appending a hero means adding its row here (a test pins the running totals).
 */
export const HERO_STYLE: Readonly<Record<string, HeroStyle>> = {
  curomo: 'melee', pax: 'melee', treenoc: 'melee', echo: 'melee', wispera: 'melee',
  fiara: 'ranged', lavax: 'ranged', sindarosa: 'ranged', ishimi: 'ranged', morblass: 'ranged', rokcore: 'ranged', cyclonius: 'ranged',
};

/** Style of a hero, or undefined for a character with no style (void, dummy). */
export function heroStyleOf(id: CharacterId | string): HeroStyle | undefined {
  return HERO_STYLE[id];
}
