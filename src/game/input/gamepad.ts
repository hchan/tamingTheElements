import { Cmd, type Command } from '@core/index';

/** The part of the Gamepad API the mapping needs (`navigator.getGamepads()` entries satisfy it). */
export interface PadSnapshot {
  readonly connected?: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value?: number }[];
}

/** Standard-mapping button indices (https://w3c.github.io/gamepad/#remapping). */
export const PadButton = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  start: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

export interface PadConfig {
  /** Stick deflection below this is ignored. */
  readonly deadzone: number;
  /** Command bit per button index; Capture is dropped unless the target is capturable. */
  readonly buttons: Readonly<Record<number, Command>>;
  /** Button index that toggles pause (an app effect, never a sim command). */
  readonly pauseButton: number;
}

/**
 * Keyed by the PadButton indices written as numbers: `[PadButton.a]` keeps an object lookup per key in the bundle
 * (rolldown inlines constants, not object members), which the size budget cannot afford. gamepad.test.ts checks every
 * key against PadButton.
 */
export const DEFAULT_PAD: PadConfig = {
  deadzone: 0.4,
  buttons: {
    0: Cmd.primary, // A
    1: Cmd.secondary, // B
    3: Cmd.capture, // Y
    4: Cmd.swap1, // LB
    5: Cmd.swap2, // RB
    6: Cmd.swap3, // LT
    7: Cmd.swap4, // RT
    12: Cmd.up, // d-pad
    13: Cmd.down,
    14: Cmd.left,
    15: Cmd.right,
  },
  pauseButton: 9, // Start
};

/**
 * Arcade pad: RT starts the super (FUN-DESIGN 2.5), RB dashes (2.7) and LT guards (2.8) instead of the fourth, second
 * and third swap (an Arcade team has one partner, tagged on LB, the first swap), and X (free in Classic) calls the
 * weather (2.14), and a press of the right stick (R3) charges (2.17); Classic keeps DEFAULT_PAD.
 */
export const ARCADE_PAD: PadConfig = {
  ...DEFAULT_PAD,
  buttons: { ...DEFAULT_PAD.buttons, 7: Cmd.super, 5: Cmd.dash, 6: Cmd.guard, 2: Cmd.weather, 11: Cmd.charge, 3: Cmd.trap }, // RT, RB, LT, X, R3, Y (Trap shares Capture's bit 6)
};

function down(pad: PadSnapshot, i: number): boolean {
  const b = pad.buttons[i];
  return b !== undefined && (b.pressed || (b.value ?? 0) > 0.5);
}

/** Left stick to direction bits. Axis tests only (no trigonometry), so a diagonal push sets two bits. */
export function stickCommand(x: number, y: number, deadzone: number): Command {
  let cmd = 0;
  if (x < -deadzone) cmd |= Cmd.left;
  else if (x > deadzone) cmd |= Cmd.right;
  if (y < -deadzone) cmd |= Cmd.up;
  else if (y > deadzone) cmd |= Cmd.down;
  return cmd;
}

/** Pad state to a Command bitset: left stick and d-pad move, A/B abilities, Y capture, bumpers and triggers swap. */
export function commandFromPad(pad: PadSnapshot | null, capturable: boolean, cfg: PadConfig = DEFAULT_PAD): Command {
  if (pad === null || pad.connected === false) return 0;
  let cmd = stickCommand(pad.axes[0] ?? 0, pad.axes[1] ?? 0, cfg.deadzone);
  for (const [i, bit] of Object.entries(cfg.buttons)) {
    if (bit === Cmd.capture && !capturable && cfg !== ARCADE_PAD) continue; // Arcade's Y is Trap, never gated
    if (down(pad, Number(i))) cmd |= bit;
  }
  return cmd;
}

/** True when the pause button went from up to down. Pass the previous held state; returns the new one too. */
export function pauseEdge(
  wasDown: boolean,
  pad: PadSnapshot | null,
  cfg: PadConfig = DEFAULT_PAD,
): { pressed: boolean; down: boolean } {
  const now = pad !== null && pad.connected !== false && down(pad, cfg.pauseButton);
  return { pressed: now && !wasDown, down: now };
}

/** First connected pad of `navigator.getGamepads()` (which may hold nulls), or null. */
export function firstPad(pads: ArrayLike<PadSnapshot | null> | null | undefined): PadSnapshot | null {
  if (!pads) return null;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p && p.connected !== false) return p;
  }
  return null;
}

/** The `n`th (0-based) connected pad: Player 1 is the first, Player 2 the second (local two-player). */
export function nthPad(pads: ArrayLike<PadSnapshot | null> | null | undefined, n: number): PadSnapshot | null {
  let seen = 0;
  for (let i = 0; pads && i < pads.length; i++) {
    const p = pads[i];
    if (p && p.connected !== false && seen++ === n) return p;
  }
  return null;
}
