import type { Element } from '@core/index';

/** A pale white-hot yellow: it reads on a lava floor where the orange fire colour blends in (QA r57: Kindrel's basic hit showed no spark). */
export const HOT_CORE = 0xfff1b8;

/**
 * Colour of the extra white-hot spark a light fire hit gets (its orange burst alone vanishes against lava), or undefined for any
 * other hit: medium and up already carry a flame signature mark and a ring.
 */
export function lightFireCore(element: Element | undefined, strength: number): number | undefined {
  return element === 'fire' && strength === 0 ? HOT_CORE : undefined;
}
