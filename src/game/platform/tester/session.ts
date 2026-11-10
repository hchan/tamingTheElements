/**
 * Tester mode state (docs/TESTER-MODE.md). Opt-in, per browser tab (sessionStorage, so it ends with the tab) and available in
 * production builds. While it is on, saves go to a throwaway slot in sessionStorage seeded from the real save, unless the owner
 * turns on "Keep cheat progress". Nothing here touches the sim rules: the cheats are state edits and a recorded sim flag.
 */
import type { ArenaCheat, BenchRow, SimFlags, TickCheats } from '@core/menu-index';
import { SAVE_KEY, createMemoryStorage, type SaveStore, type StorageAdapter } from '../storage/save-store';
import { createLocalSaveStore } from '../storage/local-save-store';

export interface TesterOptions {
  /** Capture (and every other ability) usable in any chapter: sets the recorded `testerCapture` sim flag. */
  readonly allAbilities: boolean;
  /** Garrison accepts a team of 1 to 3 heroes in any chapter, so Swap is available. */
  readonly bigTeam: boolean;
  /** Zeroes the player's swap cooldown every tick. */
  readonly instantSwap: boolean;
  /** Keeps the player's team at full health. */
  readonly godMode: boolean;
  /** Shows the bench panel (current / max health with the rest ceiling) during play. */
  readonly benchHud: boolean;
  /** Writes progress to the real save instead of the throwaway slot. */
  readonly keepProgress: boolean;
}

export type TesterOptionKey = keyof TesterOptions;

export const DEFAULT_TESTER_OPTIONS: TesterOptions = {
  allAbilities: true,
  bigTeam: true,
  instantSwap: false,
  godMode: false,
  benchHud: true,
  keepProgress: false,
};

export const TESTER_STORAGE_KEY = 'tte.tester';

type Mem = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** What the running Arena offers the tester panel; registered while a battle is up. */
export interface ArenaBridge {
  cheat(cheat: ArenaCheat): void;
  bench(): BenchRow[];
}

interface Persisted {
  readonly enabled: boolean;
  readonly options: TesterOptions;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Parses the persisted JSON; anything malformed means "off". */
export function parsePersisted(text: string | null): Persisted {
  const off: Persisted = { enabled: false, options: DEFAULT_TESTER_OPTIONS };
  if (text === null) return off;
  try {
    const raw = JSON.parse(text) as { enabled?: unknown; options?: Record<string, unknown> } | null;
    if (raw?.enabled !== true) return off;
    const o = raw.options ?? {};
    const d = DEFAULT_TESTER_OPTIONS;
    return {
      enabled: true,
      options: {
        allAbilities: bool(o['allAbilities'], d.allAbilities),
        bigTeam: bool(o['bigTeam'], d.bigTeam),
        instantSwap: bool(o['instantSwap'], d.instantSwap),
        godMode: bool(o['godMode'], d.godMode),
        benchHud: bool(o['benchHud'], d.benchHud),
        keepProgress: bool(o['keepProgress'], d.keepProgress),
      },
    };
  } catch {
    return off;
  }
}

function browserMem(pick: () => Storage): Mem | undefined {
  try {
    return pick();
  } catch {
    return undefined;
  }
}

export class TesterSession {
  private state: Persisted;
  private readonly listeners = new Set<() => void>();
  private bridge: ArenaBridge | undefined;
  /** Holds the throwaway save; in-memory when sessionStorage is unavailable. */
  private readonly slot: Mem;

  constructor(
    private readonly session: Mem | undefined,
    private readonly real: Pick<Mem, 'getItem'> | undefined,
  ) {
    this.slot = session ?? createMemoryStorage();
    this.state = parsePersisted(this.read());
  }

  private read(): string | null {
    try {
      return this.session?.getItem(TESTER_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private persist(): void {
    try {
      if (this.state.enabled) this.session?.setItem(TESTER_STORAGE_KEY, JSON.stringify(this.state));
      else this.session?.removeItem(TESTER_STORAGE_KEY);
    } catch {
      /* the choice then lasts only until the page reloads */
    }
    for (const fn of [...this.listeners]) fn();
  }

  get enabled(): boolean {
    return this.state.enabled;
  }

  get options(): TesterOptions {
    return this.state.options;
  }

  /** Saves go to the throwaway slot: tester mode is on and "Keep cheat progress" is off. */
  usesThrowawaySlot(): boolean {
    return this.state.enabled && !this.state.options.keepProgress;
  }

  /** Where save readers should look right now. */
  saveStorage(real: Pick<Mem, 'getItem'>): Pick<Mem, 'getItem'> {
    return this.usesThrowawaySlot() ? this.slot : real;
  }

  /** The throwaway slot as a StorageAdapter (same key as the real save, different storage). */
  slotStorage(): StorageAdapter {
    return this.slot;
  }

  /** Copies the real save into the throwaway slot (a missing real save clears the slot). */
  reseed(): void {
    const text = this.real?.getItem(SAVE_KEY) ?? null;
    if (text === null) this.slot.removeItem(SAVE_KEY);
    else this.slot.setItem(SAVE_KEY, text);
  }

  /** The throwaway slot's save text, or null when there is none. */
  slotText(): string | null {
    return this.slot.getItem(SAVE_KEY);
  }

  /** Turns tester mode on (no-op when it already is) and seeds the throwaway slot from the real save. */
  enable(): void {
    if (this.state.enabled) return;
    this.state = { enabled: true, options: DEFAULT_TESTER_OPTIONS };
    this.reseed();
    this.persist();
  }

  /** Turns it off and discards the throwaway slot. */
  disable(): void {
    this.state = { enabled: false, options: DEFAULT_TESTER_OPTIONS };
    this.slot.removeItem(SAVE_KEY);
    this.bridge = undefined;
    this.persist();
  }

  setOption(key: TesterOptionKey, value: boolean): void {
    if (!this.state.enabled) return;
    this.state = { enabled: true, options: { ...this.state.options, [key]: value } };
    this.persist();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Sim flags for a new match: `base` plus `testerCapture` when "all abilities" is on. Unchanged when tester mode is off. */
  simFlags(base: SimFlags): SimFlags {
    return this.state.enabled && this.state.options.allAbilities ? { ...base, testerCapture: true } : base;
  }

  /** Per-tick cheats for the running match (all off when tester mode is off). */
  tickCheats(): TickCheats {
    const o = this.state.options;
    return this.state.enabled ? { godMode: o.godMode, instantSwap: o.instantSwap } : { godMode: false, instantSwap: false };
  }

  attachArena(bridge: ArenaBridge): () => void {
    this.bridge = bridge;
    this.persist();
    return () => {
      if (this.bridge === bridge) {
        this.bridge = undefined;
        this.persist();
      }
    };
  }

  get arena(): ArenaBridge | undefined {
    return this.bridge;
  }
}

/** The app-wide session: sessionStorage for the state and the throwaway save, localStorage only as the seed. */
export const tester = new TesterSession(
  browserMem(() => globalThis.sessionStorage),
  browserMem(() => globalThis.localStorage),
);

/** A SaveStore that follows the session: the real store normally, the throwaway slot while cheating. */
export interface TesterAwareStore extends SaveStore {
  readonly real: SaveStore;
}

export function createTesterStore(real: SaveStore, session: TesterSession, now: () => number): TesterAwareStore {
  const slot = createLocalSaveStore(session.slotStorage(), now);
  const cur = (): SaveStore => (session.usesThrowawaySlot() ? slot : real);
  return {
    real,
    load: () => cur().load(),
    save: (state) => cur().save(state),
    clear: () => cur().clear(),
    exportJson: () => cur().exportJson(),
    importJson: (text) => cur().importJson(text),
  };
}

/** Save storage for the synchronous menu readers (main menu, garrison, settings). */
export function activeSaveStorage(): Pick<Storage, 'getItem'> {
  return tester.saveStorage(globalThis.localStorage);
}
