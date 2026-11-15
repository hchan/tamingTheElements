import { ABILITIES_A } from './abilities-a';
import { ABILITIES_B } from './abilities-b';
import { ABILITIES_C } from './abilities-c';
import type { AbilityDefB } from './abilities-b';

/**
 * Every ability def in the stable, append-only order (A, then B, then C). An ability's index here is its hashed defId:
 * never reorder or insert, only append (abilities-order.test.ts pins it).
 */
export const ALL_ABILITIES: readonly AbilityDefB[] = [...ABILITIES_A, ...ABILITIES_B, ...ABILITIES_C];
