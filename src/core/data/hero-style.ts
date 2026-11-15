import type { CharacterId } from './ids';

export type HeroStyle = 'melee' | 'ranged';

const STYLE_ROWS: Readonly<Record<string, HeroStyle>> = {
  curomo: 'melee', pax: 'melee', treenoc: 'melee', echo: 'melee', wispera: 'melee',
  fiara: 'ranged', lavax: 'ranged', sindarosa: 'ranged', ishimi: 'ranged', morblass: 'ranged', rokcore: 'ranged', cyclonius: 'ranged',
};

/**
 * Single source of truth for a hero's fighting style (roster-24 plan section 2.2). Void and dummy are excluded.
 * The Arcade sim's `RANGED` flag (`systems/arcade/meter.ts`) reads it since SIM_VERSION 69 (roster WP 0.4): a melee hero
 * can Charge and fills weather charge by walking, a ranged one cannot Charge and fills it by casting. The UI, the AI,
 * the balance tools and the style gates read it too.
 * Appending a hero means adding its row here (a test pins the running totals). Changing a row changes the Arcade sim.
 */
export const HERO_STYLE: Readonly<Record<CharacterId, HeroStyle>> = STYLE_ROWS;

/** Style of a hero, or undefined for a character with no style (void, dummy). */
export function heroStyleOf(id: CharacterId): HeroStyle | undefined {
  return HERO_STYLE[id];
}
