import { migrate, newEmptyState, type SaveV1 } from '@core/menu-index';
import {
  BACKUP_KEY,
  SAVE_KEY,
  type Result,
  type SaveStore,
  type StorageAdapter,
} from './save-store';

/** Browser localStorage as an adapter, or undefined when unavailable (e.g. blocked by privacy settings). */
export function browserStorage(): StorageAdapter | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function parse(text: string): Result<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    return { ok: false, error: { kind: 'corrupt', message: message(e) } };
  }
}

function guarded<T>(fn: () => Result<T>): Promise<Result<T>> {
  try {
    return Promise.resolve(fn());
  } catch (e) {
    return Promise.resolve({ ok: false, error: { kind: 'storage', message: message(e) } });
  }
}

function isLegacy(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) && !('schemaVersion' in raw);
}

export function createLocalSaveStore(storage: StorageAdapter, now: () => number): SaveStore {
  const write = (state: SaveV1): SaveV1 => {
    const stamped = { ...state, savedAt: now() };
    storage.setItem(SAVE_KEY, JSON.stringify(stamped));
    return stamped;
  };

  /** Migrate raw JSON text and write v1 back; a legacy (v0) save is first backed up once. */
  const ingest = (text: string, backup: boolean): Result<SaveV1> => {
    const parsed = parse(text);
    if (!parsed.ok) return parsed;
    const m = migrate(parsed.value);
    if (!m.ok) return m;
    if (backup && isLegacy(parsed.value) && storage.getItem(BACKUP_KEY) === null) {
      storage.setItem(BACKUP_KEY, text);
    }
    return { ok: true, value: write(m.value) };
  };

  /** Current stored save migrated in memory (no writes). */
  const peek = (): Result<SaveV1> => {
    const text = storage.getItem(SAVE_KEY);
    if (text === null) return { ok: true, value: newEmptyState() };
    const parsed = parse(text);
    if (!parsed.ok) return parsed;
    return migrate(parsed.value);
  };

  return {
    load: () =>
      guarded(() => {
        const text = storage.getItem(SAVE_KEY);
        const parsed = text === null ? undefined : parse(text);
        if (text !== null && parsed?.ok && isLegacy(parsed.value)) return ingest(text, true);
        return peek();
      }),
    save: (state) => guarded(() => ({ ok: true, value: write(state) })),
    clear: () => {
      storage.removeItem(SAVE_KEY);
      return Promise.resolve();
    },
    exportJson: () =>
      guarded(() => {
        const r = peek();
        return r.ok ? { ok: true, value: JSON.stringify(r.value, null, 2) } : r;
      }),
    importJson: (text) => guarded(() => ingest(text, false)),
  };
}
