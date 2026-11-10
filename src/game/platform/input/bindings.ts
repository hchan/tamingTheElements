/** Pure key-binding model: defaults, validation, conflict detection and (de)serialisation. No DOM, no Phaser. */

/** Gameplay actions a key can be bound to. */
export const GAME_ACTIONS = [
  'up',
  'down',
  'left',
  'right',
  'slot1',
  'slot2',
  'slot3',
  'slot4',
  'slot5',
  'capture',
] as const;
export type GameAction = (typeof GAME_ACTIONS)[number];

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

export const ACTION_LABELS: Readonly<Record<GameAction, string>> = {
  up: 'Move Up',
  down: 'Move Down',
  left: 'Move Left',
  right: 'Move Right',
  slot1: 'Primary Ability',
  slot2: 'Secondary Ability',
  slot3: 'Swap 1',
  slot4: 'Swap 2',
  slot5: 'Swap 3',
  capture: 'Capture',
};

/** Keys that can never be bound: they drive the browser or the app shell. */
export const RESERVED_CODES: ReadonlySet<string> = new Set([
  'Escape',
  'Tab',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'CapsLock',
  'ContextMenu',
  // Fullscreen toggle (presentation.ts) is hard-wired to F.
  'KeyF',
]);

const CODE_SHAPE = /^[A-Za-z0-9]{1,24}$/;

export function isBindableCode(code: string): boolean {
  return CODE_SHAPE.test(code) && !RESERVED_CODES.has(code);
}

/** Human label for a `KeyboardEvent.code`: `KeyW` -> `W`, `Digit1` -> `1`, `ArrowUp` -> `Up`. */
export function codeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** The action a code is bound to, if any. */
export function actionForCode(bindings: Bindings, code: string): GameAction | undefined {
  return GAME_ACTIONS.find((a) => bindings[a].includes(code));
}

/** Rebinds one action to exactly `codes`. A code can drive one action, so it is removed from all others. */
export function rebind(bindings: Bindings, action: GameAction, codes: readonly string[]): Bindings {
  const out = {} as Record<GameAction, readonly string[]>;
  for (const a of GAME_ACTIONS) out[a] = a === action ? [...codes] : bindings[a].filter((c) => !codes.includes(c));
  return out;
}

export type BindResult =
  | { readonly ok: true; readonly bindings: Bindings }
  | { readonly ok: false; readonly reason: 'reserved' }
  | { readonly ok: false; readonly reason: 'conflict'; readonly with: GameAction };

/** Maximum keys per action: a primary and an alternate. */
export const SLOTS_PER_ACTION = 2;

function withSlot(keys: readonly string[], slot: number, code: string): string[] {
  const next = [...keys];
  while (next.length < slot) next.push(code);
  next[slot] = code;
  return next.filter((c, i) => next.indexOf(c) === i);
}

/**
 * Binds `code` to `slot` (0 primary, 1 alternate) of `action`. Fails on reserved keys and on a code that
 * already drives a different action (conflict detection); the caller may then call `rebind` to steal it.
 */
export function tryBind(bindings: Bindings, action: GameAction, slot: number, code: string): BindResult {
  if (!isBindableCode(code)) return { ok: false, reason: 'reserved' };
  const owner = actionForCode(bindings, code);
  if (owner !== undefined && owner !== action) return { ok: false, reason: 'conflict', with: owner };
  return { ok: true, bindings: rebind(bindings, action, withSlot(bindings[action], slot, code)) };
}

/** Moves `code` to `action` even though another action had it; the other action keeps its remaining keys. */
export function bindSteal(bindings: Bindings, action: GameAction, slot: number, code: string): Bindings {
  return rebind(bindings, action, withSlot(bindings[action], slot, code));
}

/** Removes the alternate key (slot 1) of an action; the primary can only be replaced, never cleared. */
export function clearAlternate(bindings: Bindings, action: GameAction): Bindings {
  return rebind(bindings, action, bindings[action].slice(0, 1));
}

export function resetBindings(): Bindings {
  return DEFAULT_BINDINGS;
}

/** True when `a` and `b` bind the same codes in the same order for every action. */
export function sameBindings(a: Bindings, b: Bindings): boolean {
  return GAME_ACTIONS.every((x) => a[x].length === b[x].length && a[x].every((c, i) => c === b[x][i]));
}

/** What to write into the save: nothing when the bindings are the defaults. */
export function bindingsToSave(bindings: Bindings): Record<string, string[]> | undefined {
  if (sameBindings(bindings, DEFAULT_BINDINGS)) return undefined;
  const out: Record<string, string[]> = {};
  for (const a of GAME_ACTIONS) out[a] = [...bindings[a]];
  return out;
}

/**
 * Sanitises whatever the save holds. Unknown actions, non-strings, reserved or malformed codes and codes
 * already claimed by an earlier action are dropped; an action left with no key falls back to its default
 * (unless that default is claimed, in which case the whole map falls back to the defaults).
 */
export function parseBindings(raw: unknown): Bindings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return DEFAULT_BINDINGS;
  const src = raw as Record<string, unknown>;
  const taken = new Set<string>();
  const out = {} as Record<GameAction, readonly string[]>;
  for (const a of GAME_ACTIONS) {
    const list = Array.isArray(src[a]) ? (src[a] as unknown[]) : [];
    const keys: string[] = [];
    for (const c of list) {
      if (typeof c !== 'string' || !isBindableCode(c) || taken.has(c) || keys.includes(c)) continue;
      if (keys.length < SLOTS_PER_ACTION) keys.push(c);
    }
    for (const c of keys) taken.add(c);
    out[a] = keys;
  }
  for (const a of GAME_ACTIONS) {
    if (out[a].length > 0) continue;
    const fallback = DEFAULT_BINDINGS[a].filter((c) => !taken.has(c));
    if (fallback.length === 0) return DEFAULT_BINDINGS;
    out[a] = fallback;
    for (const c of fallback) taken.add(c);
  }
  return out;
}

let current: Bindings = DEFAULT_BINDINGS;

/** The bindings in force; set at start-up from the save and by the Key Bindings screen. */
export function getBindings(): Bindings {
  return current;
}

export function setBindings(next: Bindings): void {
  current = next;
}
