import type { SimFlags } from '../flags';

/**
 * One player's input for one tick: a u16 bitset. Bits 11..15 are reserved and must be zero in Classic. The Arcade
 * ruleset names bits 11 dash, 12 guard, 13 super, 14 weather and 15 charge (see inputMaskFor).
 */
export type Command = number;

export const Cmd = {
  up: 1 << 0,
  down: 1 << 1,
  left: 1 << 2,
  right: 1 << 3,
  primary: 1 << 4,
  secondary: 1 << 5,
  capture: 1 << 6,
  /**
   * Arcade's name for bit 6 (WP 39): plant a trap. Arcade never reads it as `capture` (systems/capture.ts is
   * Classic-only for it), Classic never reads it as a trap; the mask, packet and replay formats are unchanged.
   */
  trap: 1 << 6,
  swap1: 1 << 7,
  swap2: 1 << 8,
  swap3: 1 << 9,
  swap4: 1 << 10,
  /**
   * Arcade's name for bit 10 (FUN-DESIGN 2.24): the elemental ability (Ember, Cleanse, Gale, Stoneskin). An Arcade team has
   * at most three heroes, so the fourth swap never exists there and swapSystem ignores the bit in Arcade; Classic never
   * reads it as the elemental ability. The mask, packet and replay formats are unchanged.
   */
  elemental: 1 << 10,
  /**
   * Arcade's name for bit 9 (ideas/in-progress/elemental-cleanse.md): the common Cleanse slot, the same for every hero. An Arcade
   * team has at most three heroes, so the third swap never exists there and swapSystem ignores the bit in Arcade; Classic
   * never reads it as Cleanse. The mask, packet and replay formats are unchanged.
   */
  cleanse: 1 << 9,
  /** Arcade only (masked off in Classic by inputMaskFor): dash (FUN-DESIGN 2.7). */
  dash: 1 << 11,
  /** Arcade only (masked off in Classic by inputMaskFor): hold to guard, press to parry (FUN-DESIGN 2.8). */
  guard: 1 << 12,
  /** Arcade only (masked off in Classic by inputMaskFor): start a super (FUN-DESIGN 2.5). */
  super: 1 << 13,
  /** Arcade only (masked off in Classic by inputMaskFor): call the caster's weather (FUN-DESIGN 2.14). */
  weather: 1 << 14,
  /** Arcade only (masked off in Classic by inputMaskFor): a melee hero's Charge gap closer (FUN-DESIGN 2.17). */
  charge: 1 << 15,
} as const;

export const CMD_RESERVED_MASK = 0xffff & ~((1 << 11) - 1);
/** Bits 11 (dash), 12 (guard), 13 (super), 14 (weather) and 15 (charge): reserved in Classic, live in Arcade. */
export const ARCADE_CMD_BITS = 0b11111 << 11;
export const NO_COMMAND: Command = 0;

/** Command bits a match with these flags accepts; everything else is masked off (net) or rejected (replay validation). */
export function inputMaskFor(flags: Pick<SimFlags, 'rulesetArcade'>): number {
  const classic = 0xffff & ~CMD_RESERVED_MASK;
  return flags.rulesetArcade ? classic | ARCADE_CMD_BITS : classic;
}

export function hasCmd(c: Command, bit: number): boolean {
  return (c & bit) !== 0;
}

/** Horizontal input sign: right - left. */
export function cmdAxisX(c: Command): number {
  return (hasCmd(c, Cmd.right) ? 1 : 0) - (hasCmd(c, Cmd.left) ? 1 : 0);
}

/** Vertical input sign (screen y is down): down - up. */
export function cmdAxisY(c: Command): number {
  return (hasCmd(c, Cmd.down) ? 1 : 0) - (hasCmd(c, Cmd.up) ? 1 : 0);
}
