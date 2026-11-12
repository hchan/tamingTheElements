/**
 * Gamepad button rebinding model: one row per rebindable action, each with a default standard-mapping button and the
 * player's override (the command each row sends lives in src/game/input/gamepad.ts, so the menu never pulls in core). Pure apart from the device-local store
 * (`tte.padBindings` in localStorage, like the touch layout: a presentation choice, never the sim-side save).
 */
export interface PadRow {
  readonly id: string;
  readonly label: string;
  /** Default standard-mapping button index. */
  readonly def: number;
}

/** Defaults mirror DEFAULT_PAD / ARCADE_PAD in src/game/input/gamepad.ts (src/game/input/pad-bindings.test.ts pins that). */
export const PAD_ROWS: readonly PadRow[] = [
  { id: 'primary', label: 'Primary Ability', def: 0 },
  { id: 'secondary', label: 'Secondary Ability', def: 1 },
  { id: 'capture', label: 'Snag or Trap', def: 3 },
  { id: 'swap1', label: 'Swap 1', def: 4 },
  { id: 'swap2', label: 'Swap 2 or Dash', def: 5 },
  { id: 'swap3', label: 'Swap 3 or Guard', def: 6 },
  { id: 'swap4', label: 'Swap 4 or Super', def: 7 },
  { id: 'weather', label: 'Weather', def: 2 },
  { id: 'charge', label: 'Charge', def: 11 },
  { id: 'elemental', label: 'Element', def: 10 },
  { id: 'up', label: 'Move Up', def: 12 },
  { id: 'down', label: 'Move Down', def: 13 },
  { id: 'left', label: 'Move Left', def: 14 },
  { id: 'right', label: 'Move Right', def: 15 },
  { id: 'pause', label: 'Pause', def: 9 },
];

/** Row id to the button index the player chose; absent rows keep their default. */
export type PadOverrides = Readonly<Record<string, number>>;

export const PAD_MAX_BUTTON = 31;
const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-pad Up', 'D-pad Down', 'D-pad Left', 'D-pad Right', 'Home'];

/** Words for a standard-mapping button index (`Button 17` beyond the standard set). */
export function padButtonLabel(index: number): string {
  return NAMES[index] ?? `Button ${String(index)}`;
}

export function padButtonFor(o: PadOverrides, id: string): number {
  return o[id] ?? PAD_ROWS.find((r) => r.id === id)?.def ?? 0;
}

function rowLabel(id: string): string {
  return PAD_ROWS.find((r) => r.id === id)?.label ?? id;
}

/** The row currently on `button`, if any (other than `except`). */
export function padOwner(o: PadOverrides, button: number, except: string): string | undefined {
  return PAD_ROWS.find((r) => r.id !== except && padButtonFor(o, r.id) === button)?.id;
}

export interface PadBindResult {
  readonly overrides: PadOverrides;
  /** Label of the action that was on the button and took this action's old button instead. */
  readonly swappedWith?: string;
}

function prune(o: Record<string, number>): PadOverrides {
  const out: Record<string, number> = {};
  for (const r of PAD_ROWS) {
    const v = o[r.id];
    if (v !== undefined && v !== r.def) out[r.id] = v;
  }
  return out;
}

/** Puts `button` on row `id`. A button drives one action: its previous owner gets the button `id` gave up (a swap). */
export function padBind(o: PadOverrides, id: string, button: number): PadBindResult {
  const old = padButtonFor(o, id);
  if (old === button) return { overrides: o };
  const owner = padOwner(o, button, id);
  const next: Record<string, number> = { ...o, [id]: button };
  if (owner !== undefined) next[owner] = old;
  return { overrides: prune(next), ...(owner !== undefined ? { swappedWith: rowLabel(owner) } : {}) };
}

export function isDefaultPad(o: PadOverrides): boolean {
  return Object.keys(o).length === 0;
}

/** Sanitises stored data: unknown rows, non-integers, out-of-range and clashing buttons are dropped (first row wins). */
export function parsePadOverrides(raw: unknown): PadOverrides {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const r of PAD_ROWS) {
    const v = src[r.id];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= PAD_MAX_BUTTON) out[r.id] = v;
  }
  // Every action must end on its own button (swaps keep that true); a map that does not is discarded whole.
  const used = PAD_ROWS.map((r) => padButtonFor(out, r.id));
  return new Set(used).size === used.length ? prune(out) : {};
}

export const PAD_BINDINGS_KEY = 'tte.padBindings';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readPadOverrides(store: Store | undefined = defaultStore()): PadOverrides {
  try {
    const raw = store?.getItem(PAD_BINDINGS_KEY);
    return raw === null || raw === undefined ? {} : parsePadOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function writePadOverrides(o: PadOverrides, store: Store | undefined = defaultStore()): void {
  try {
    store?.setItem(PAD_BINDINGS_KEY, JSON.stringify(o));
  } catch {
    // Private mode or quota: the choice just lasts until reload.
  }
}

let current: PadOverrides | null = null;

/** The active overrides (read from the store once, then cached: the game polls this every frame). */
export function getPadOverrides(): PadOverrides {
  current ??= readPadOverrides();
  return current;
}

/** Makes `o` the active overrides; `persist` also writes them to the device store. */
export function setPadOverrides(o: PadOverrides, persist = false): void {
  current = o;
  if (persist) writePadOverrides(o);
}
