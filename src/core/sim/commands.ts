/** One player's input for one tick: a u16 bitset. Bits 11..15 are reserved and must be zero. */
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
} as const;

export const CMD_RESERVED_MASK = 0xffff & ~((1 << 11) - 1);
export const NO_COMMAND: Command = 0;

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
