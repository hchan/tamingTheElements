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

export const DEFAULT_PAD: PadConfig = {
  deadzone: 0.4,
  buttons: {
    [PadButton.a]: Cmd.primary,
    [PadButton.b]: Cmd.secondary,
    [PadButton.y]: Cmd.capture,
    [PadButton.lb]: Cmd.swap1,
    [PadButton.rb]: Cmd.swap2,
    [PadButton.lt]: Cmd.swap3,
    [PadButton.rt]: Cmd.swap4,
    [PadButton.dpadUp]: Cmd.up,
    [PadButton.dpadDown]: Cmd.down,
    [PadButton.dpadLeft]: Cmd.left,
    [PadButton.dpadRight]: Cmd.right,
  },
  pauseButton: PadButton.start,
};

/** Arcade pad: RT starts the super (FUN-DESIGN 2.5) instead of the fourth swap; Classic keeps DEFAULT_PAD. */
export const ARCADE_PAD: PadConfig = { ...DEFAULT_PAD, buttons: { ...DEFAULT_PAD.buttons, [PadButton.rt]: Cmd.super } };

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
  for (const key of Object.keys(cfg.buttons)) {
    const i = Number(key);
    const bit = cfg.buttons[i] ?? 0;
    if (bit === Cmd.capture && !capturable) continue;
    if (down(pad, i)) cmd |= bit;
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
