import type { SimFlags } from '../flags';

/**
 * One player's input for one tick: a u16 bitset. Bits 11..15 are reserved and must be zero in Classic. The Arcade
 * ruleset names bits 11 dash, 12 guard and 13 super; 14 and 15 stay reserved (see inputMaskFor).
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
  swap1: 1 << 7,
  swap2: 1 << 8,
  swap3: 1 << 9,
  swap4: 1 << 10,
  /** Arcade only (masked off in Classic by inputMaskFor): dash (FUN-DESIGN 2.7). */
  dash: 1 << 11,
  /** Arcade only (masked off in Classic by inputMaskFor): hold to guard, press to parry (FUN-DESIGN 2.8). */
  guard: 1 << 12,
  /** Arcade only (masked off in Classic by inputMaskFor): start a super (FUN-DESIGN 2.5). */
  super: 1 << 13,
} as const;

export const CMD_RESERVED_MASK = 0xffff & ~((1 << 11) - 1);
/** Bits 11 (dash), 12 (guard) and 13 (super): reserved in Classic, live in Arcade. */
export const ARCADE_CMD_BITS = 0b111 << 11;
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
