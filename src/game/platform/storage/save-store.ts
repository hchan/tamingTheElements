import type { SaveError, SaveV1 } from '@core/index';

export const SAVE_KEY = 'Taming the Elements';
export const BACKUP_KEY = 'Taming the Elements.v0.bak';

export type StoreError = SaveError | { kind: 'corrupt'; message: string } | { kind: 'storage'; message: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: StoreError };

/** The subset of the DOM `Storage` the store needs; `localStorage` satisfies it. */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveStore {
  /** Reads, migrates (backing up raw v0 once) and writes back v1. No save gives a fresh empty state. */
  load(): Promise<Result<SaveV1>>;
  /** Stamps `savedAt` from the injected clock and persists. */
  save(state: SaveV1): Promise<Result<SaveV1>>;
  clear(): Promise<void>;
  /** The current save as pretty JSON, for download. */
  exportJson(): Promise<Result<string>>;
  /** Parses, migrates and persists a save from JSON text. */
  importJson(text: string): Promise<Result<SaveV1>>;
}

/** In-memory adapter for tests and non-browser contexts. */
export function createMemoryStorage(initial: Record<string, string> = {}): StorageAdapter {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}
