import { Cmd, type Command } from '@core/index';

/** Gameplay actions a key can be bound to. Pure data: no gameplay logic lives here. */
export type GameAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'capture';

/** App-level actions: handled by the shell, never sent to the sim. */
export type AppAction = 'pause' | 'mute';
export type CheatAction = 'cheatQ' | 'cheatX' | 'cheatC';

/** Bindings map an action to `KeyboardEvent.code` values. */
export type Bindings = Readonly<Record<GameAction, readonly string[]>>;

export const DEFAULT_BINDINGS: Bindings = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  slot1: ['Digit1', 'Space'],
  slot2: ['Digit2', 'Enter'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5'],
  capture: ['KeyC'],
};

/** Sim command bit(s) per action; slots 3..5 are the character swaps. */
export const ACTION_COMMAND: Readonly<Record<GameAction, Command>> = {
  up: Cmd.up,
  down: Cmd.down,
  left: Cmd.left,
  right: Cmd.right,
  slot1: Cmd.primary,
  slot2: Cmd.secondary,
  slot3: Cmd.swap1,
  slot4: Cmd.swap2,
  slot5: Cmd.swap3,
  capture: Cmd.capture,
};

/** Rebinds one action. A code can only drive one action, so it is removed from all others. */
export function rebind(bindings: Bindings, action: GameAction, codes: readonly string[]): Bindings {
  const out = {} as Record<GameAction, readonly string[]>;
  for (const a of Object.keys(bindings) as GameAction[]) {
    out[a] = a === action ? [...codes] : bindings[a].filter((c) => !codes.includes(c));
  }
  return out;
}

/** The action a code is bound to, if any. */
export function actionForCode(bindings: Bindings, code: string): GameAction | undefined {
  for (const a of Object.keys(bindings) as GameAction[]) {
    if (bindings[a].includes(code)) return a;
  }
  return undefined;
}

/** Held key codes to a command bitset. Capture is dropped unless `capturable`. */
export function commandFromHeld(bindings: Bindings, held: ReadonlySet<string>, capturable: boolean): Command {
  let cmd = 0;
  for (const code of held) {
    const a = actionForCode(bindings, code);
    if (a === undefined) continue;
    if (a === 'capture' && !capturable) continue;
    cmd |= ACTION_COMMAND[a];
  }
  return cmd;
}

export interface KeyInput {
  readonly type: 'down' | 'up' | 'blur';
  readonly code: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly repeat: boolean;
}

export interface KeyState {
  readonly held: ReadonlySet<string>;
}

export type KeyEffect = AppAction | CheatAction;

export const INITIAL_KEY_STATE: KeyState = { held: new Set() };

const CHEATS: Readonly<Record<string, CheatAction>> = { KeyQ: 'cheatQ', KeyX: 'cheatX', KeyC: 'cheatC' };

/** Pure reducer: next held set plus any app or cheat effect (fired once per physical press). */
export function reduceKey(
  state: KeyState,
  input: KeyInput,
  bindings: Bindings,
  cheatsEnabled: boolean,
): { state: KeyState; effect?: KeyEffect } {
  if (input.type === 'blur') return { state: INITIAL_KEY_STATE };
  if (input.type === 'up') {
    if (!state.held.has(input.code)) return { state };
    const held = new Set(state.held);
    held.delete(input.code);
    return { state: { held } };
  }
  if (input.shiftKey && input.code === 'KeyP') return input.repeat ? { state } : { state, effect: 'pause' };
  if (input.ctrlKey && input.code === 'KeyM') return input.repeat ? { state } : { state, effect: 'mute' };
  const cheat = input.shiftKey && cheatsEnabled ? CHEATS[input.code] : undefined;
  if (cheat !== undefined) return input.repeat ? { state } : { state, effect: cheat };
  if (state.held.has(input.code)) return { state };
  return { state: { held: new Set(state.held).add(input.code) } };
}
