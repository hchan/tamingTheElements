import type { Element } from '@core/index';

/** Hit, spark and super cut-in colour by element (its own module so the on-demand super view shares it without a cycle). */
export const ELEMENT_COLORS: Readonly<Record<Element, number>> = {
  fire: 0xff7a1a, air: 0xc8f0ff, earth: 0xc89650, water: 0x3aa0ff, void: 0xc080ff,
};
