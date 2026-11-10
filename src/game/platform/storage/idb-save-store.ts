import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { migrate, newEmptyState, type SaveV1 } from '@core/index';
import { createLocalSaveStore } from './local-save-store';
import { SAVE_KEY, type Result, type SaveStore, type StorageAdapter } from './save-store';

export const DB_NAME = 'tte';
export const DB_VERSION = 1;
export const SLOT = 'main';
export const MAX_BACKUPS = 5;

interface TteDb extends DBSchema {
  saves: { key: string; value: unknown };
  backups: { key: number; value: unknown };
  meta: { key: string; value: unknown };
}

type Db = IDBPDatabase<TteDb>;

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Upgrade steps, one case per old version; fall through so a fresh DB runs every step. */
function upgrade(db: Db, oldVersion: number): void {
  switch (oldVersion) {
    case 0:
      db.createObjectStore('saves');
      db.createObjectStore('backups', { autoIncrement: true });
      db.createObjectStore('meta');
    // future versions: add `case 1:` etc. below, never edit earlier steps
  }
}

/** True when this context has IndexedDB. */
export function idbAvailable(): boolean {
  try {
    return (globalThis as { indexedDB?: IDBFactory | null }).indexedDB != null;
  } catch {
    return false;
  }
}

/**
 * IndexedDB-backed save store. `mirror` (localStorage) is imported from on first run and kept
 * written after every save for legacy compatibility.
 */
export function createIdbSaveStore(mirror: StorageAdapter | undefined, now: () => number): SaveStore {
  let dbPromise: Promise<Db> | undefined;
  const db = (): Promise<Db> => (dbPromise ??= openDB<TteDb>(DB_NAME, DB_VERSION, {
      upgrade: (d, old) => {
        upgrade(d, old);
      },
    }));
  const local = mirror ? createLocalSaveStore(mirror, now) : undefined;

  const guarded = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
    try {
      return await fn();
    } catch (e) {
      return { ok: false, error: { kind: 'storage', message: message(e) } };
    }
  };

  /** Atomic: the new record goes into `backups` (trimmed to the last 5) and `saves` in one transaction. */
  const persist = async (state: SaveV1): Promise<SaveV1> => {
    const stamped = { ...state, savedAt: now() };
    const d = await db();
    const tx = d.transaction(['saves', 'backups'], 'readwrite');
    const backups = tx.objectStore('backups');
    await backups.add(stamped);
    let cursor = await backups.openKeyCursor();
    const keys: number[] = [];
    while (cursor) {
      keys.push(cursor.key);
      cursor = await cursor.continue();
    }
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_BACKUPS))) await backups.delete(k);
    await tx.objectStore('saves').put(stamped, SLOT);
    await tx.done;
    try {
      mirror?.setItem(SAVE_KEY, JSON.stringify(stamped));
    } catch {
      // the mirror is best effort; IndexedDB holds the truth
    }
    return stamped;
  };

  const current = async (): Promise<Result<SaveV1> | undefined> => {
    const raw = await (await db()).get('saves', SLOT);
    return raw === undefined ? undefined : migrate(raw);
  };

  /** First run: import whatever localStorage holds (migrating v0, backing it up raw). */
  const importFromMirror = async (): Promise<Result<SaveV1>> => {
    if (!local || mirror?.getItem(SAVE_KEY) == null) return { ok: true, value: newEmptyState() };
    const r = await local.load();
    if (!r.ok) return r;
    return { ok: true, value: await persist(r.value) };
  };

  return {
    load: () =>
      guarded(async () => {
        const cur = await current();
        if (cur) return cur;
        return importFromMirror();
      }),
    save: (state) => guarded(async () => ({ ok: true, value: await persist(state) })),
    clear: async () => {
      try {
        const d = await db();
        const tx = d.transaction(['saves', 'backups'], 'readwrite');
        await Promise.all([tx.objectStore('saves').clear(), tx.objectStore('backups').clear(), tx.done]);
      } catch {
        // nothing to clear if the database is unavailable
      }
      mirror?.removeItem(SAVE_KEY);
    },
    exportJson: () =>
      guarded(async () => {
        const r = (await current()) ?? (await importFromMirror());
        return r.ok ? { ok: true, value: JSON.stringify(r.value, null, 2) } : r;
      }),
    importJson: (text) =>
      guarded(async () => {
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch (e) {
          return { ok: false, error: { kind: 'corrupt', message: message(e) } };
        }
        const m = migrate(raw);
        if (!m.ok) return m;
        return { ok: true, value: await persist(m.value) };
      }),
  };
}

let persistRequested = false;

/**
 * Ask the browser for persistent storage (Safari evicts script-writable storage after 7 days).
 * Call after the first capture or level-up, never before progress exists. Asks at most once.
 */
export async function requestPersistence(
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = (
    globalThis as { navigator?: Navigator }
  ).navigator?.storage,
): Promise<boolean> {
  if (!storage || persistRequested) return false;
  persistRequested = true;
  try {
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return false;
  }
}

/** Test helper: allow `requestPersistence` to run again. */
export function resetPersistenceRequest(): void {
  persistRequested = false;
}
