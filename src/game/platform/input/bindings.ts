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
  'super',
  'dash',
  'guard',
  'weather',
  'charge',
  'trap',
  'elemental',
  'cleanse',
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
  // Arcade only (key-map drops it in Classic). Plain X: Shift-X stays the tester cheat.
  // The numbered action row (Charge 5, Weather 6, Dash 7, Guard 8, Super 9, after Tag 3 / Tag 2 4) adds a DigitN alternate
  // to each Arcade action; the letter keys stay as the primary.
  super: ['KeyX', 'Digit9'],
  // Arcade only too (FUN-DESIGN 2.7, 2.8). Plain Q: Shift-Q stays the tester cheat.
  dash: ['KeyE', 'Digit7'],
  guard: ['KeyQ', 'Digit8'],
  // Arcade only (FUN-DESIGN 2.14): calls the weather of the fighter's element.
  weather: ['KeyR', 'Digit6'],
  // Arcade only (FUN-DESIGN 2.17): the melee Charge. H, because F is the fullscreen toggle.
  // Digit5 is also Swap 3 (slot5): the one deliberately shared default code (SHARED_CODE). Swap 3 is the fourth hero, which
  // only a Classic party has; Arcade has at most three heroes, so there key-map reads Digit5 as Charge and Classic as Swap 3.
  charge: ['KeyH', 'Digit5'],
  // Arcade only (WP 39): the Trap. Z, because F is the fullscreen toggle; Digit0 ends the numbered row (Charge 5 .. Super 9).
  // Shares the sim's command bit 6 with Capture, which Arcade does not have (key-map reads it as Trap there only).
  trap: ['KeyZ', 'Digit0'],
  // Arcade only (FUN-DESIGN 2.24): the elemental ability. V next to Z X C; Minus after Digit0, as the digit row is full.
  // Shares the sim's command bit 10 with the fourth swap, which Arcade (three heroes at most) never has.
  elemental: ['KeyV', 'Minus'],
  // Arcade only (ideas/in-progress/elemental-cleanse.md): the common Cleanse, clearing your own bad statuses. Equal, next to Minus.
  // Shares the sim's command bit 9 with the third swap, which Arcade (three heroes at most) never has.
  cleanse: ['Equal'],
};

/** Digit5 may drive both Swap 3 (Classic) and Charge (Arcade) at once; every other code drives one action. */
export const SHARED_CODE = 'Digit5';
function shared(a: GameAction, b: GameAction, code: string): boolean {
  return code === SHARED_CODE && ((a === 'slot5' && b === 'charge') || (a === 'charge' && b === 'slot5'));
}

export const ACTION_LABELS: Readonly<Record<GameAction, string>> = {
  up: 'Move Up',
  down: 'Move Down',
  left: 'Move Left',
  right: 'Move Right',
  slot1: 'Primary Ability',
  slot2: 'Secondary Ability',
  slot3: 'Tag 1',
  slot4: 'Tag 2',
  slot5: 'Tag 3',
  capture: 'Snag',
  super: 'Super',
  dash: 'Dash',
  guard: 'Guard',
  weather: 'Weather',
  charge: 'Charge',
  trap: 'Trap',
  elemental: 'Element',
  cleanse: 'Cleanse',
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
  if (code === 'Minus') return '-';
  if (code === 'Equal') return '=';
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** The number key each Arcade action wears on its box (FUN-DESIGN 2.17); Element wears the key after 0 (Minus, shown as -) while it is bound, else its first key. */
const ARCADE_DIGIT: Readonly<Partial<Record<GameAction, number>>> = { super: 9, guard: 8, dash: 7, weather: 6, charge: 5, trap: 0 };

/**
 * The one key name an action wears on its action-bar box, and so in every hint that names it (the first-run card reads this too, so the two cannot drift).
 * The numbered action row (3 Tag ... 9 Super, 0 Trap): a box wears its number while that number key is bound to it, else its first key.
 */
export function actionKeyLabel(bindings: Bindings, action: GameAction): string | undefined {
  const digit = ARCADE_DIGIT[action];
  const keys = bindings[action];
  const numberKey = digit !== undefined ? `Digit${String(digit)}` : action === 'elemental' ? 'Minus' : action === 'cleanse' ? 'Equal' : undefined;
  const code = numberKey !== undefined && keys.includes(numberKey) ? numberKey : keys[0];
  return code === undefined ? undefined : codeLabel(code);
}


/** The action a code is bound to, if any. */
export function actionForCode(bindings: Bindings, code: string): GameAction | undefined {
  return GAME_ACTIONS.find((a) => bindings[a].includes(code));
}

/** Rebinds one action to exactly `codes`. A code can drive one action, so it is removed from all others. */
export function rebind(bindings: Bindings, action: GameAction, codes: readonly string[]): Bindings {
  const out = {} as Record<GameAction, readonly string[]>;
  for (const a of GAME_ACTIONS) out[a] = a === action ? [...codes] : bindings[a].filter((c) => !codes.includes(c) || shared(a, action, c));
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
  const owner = GAME_ACTIONS.find((a) => a !== action && bindings[a].includes(code) && !shared(a, action, code));
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

/**
 * Fighting-game layout (Key Bindings preset): move with the left hand, attack with the right on the home and top rows
 * (J K L, U I O) instead of the number row. Space and Enter stay as alternates for the two attacks.
 */
export const SF_PRESET_BINDINGS: Bindings = {
  ...DEFAULT_BINDINGS,
  slot1: ['KeyJ', 'Space'],
  slot2: ['KeyK', 'Enter'],
  dash: ['KeyL'],
  guard: ['KeyI'],
  super: ['KeyO'],
  weather: ['KeyU'],
  charge: ['KeyH'],
  trap: ['KeyZ'],
  elemental: ['KeyV'],
};

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
 * (unless that default is claimed, in which case the whole map falls back to the defaults; an action the save does not
 * name, such as one added after it was written, stays unbound instead so the player's keys survive).
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
      if (typeof c !== 'string' || !isBindableCode(c) || keys.includes(c)) continue;
      if (taken.has(c) && !(a === 'charge' && c === SHARED_CODE && out.slot5.includes(c))) continue;
      if (keys.length < SLOTS_PER_ACTION) keys.push(c);
    }
    for (const c of keys) taken.add(c);
    out[a] = keys;
  }
  for (const a of GAME_ACTIONS) {
    if (out[a].length > 0) continue;
    const fallback = DEFAULT_BINDINGS[a].filter((c) => !taken.has(c) || (a === 'charge' && c === SHARED_CODE && out.slot5.includes(c)));
    if (fallback.length === 0) {
      if (a in src) return DEFAULT_BINDINGS;
      continue;
    }
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
