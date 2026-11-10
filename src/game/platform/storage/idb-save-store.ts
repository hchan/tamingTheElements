import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { migrate, newEmptyState, type SaveV1 } from '@core/menu-index';
import { createLocalSaveStore } from './local-save-store';
import { notify } from './notices';
import { SAVE_KEY, type Result, type SaveStore, type StorageAdapter } from './save-store';

export const CHANNEL_NAME = 'tte-save';

/** The slice of BroadcastChannel the store uses, so tests can inject a fake. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (e: { data: unknown }) => void): void;
  close(): void;
}

export interface IdbStoreOptions {
  /** Cross-tab channel; defaults to BroadcastChannel when the browser has it. */
  readonly channel?: ChannelLike | null;
  readonly notify?: (message: string) => void;
}

function defaultChannel(): ChannelLike | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

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
export function createIdbSaveStore(
  mirror: StorageAdapter | undefined,
  now: () => number,
  options: IdbStoreOptions = {},
): SaveStore {
  const say = options.notify ?? notify;
  let dbPromise: Promise<Db> | undefined;
  const db = (): Promise<Db> => (dbPromise ??= openDB<TteDb>(DB_NAME, DB_VERSION, {
      upgrade: (d, old) => {
        upgrade(d, old);
      },
      // Another tab holds an older connection open while we try to upgrade: tell the player instead of hanging.
      blocked: () => {
        say('The save database is being used by another tab. Close other Taming the Elements tabs to continue.');
      },
      // A newer tab wants to upgrade: release our connection so it is not blocked, and reopen on next use.
      blocking: () => {
        const old = dbPromise;
        dbPromise = undefined;
        void old?.then((d) => { d.close(); }, () => undefined);
      },
      terminated: () => {
        dbPromise = undefined;
      },
    }));
  const self = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(now());
  const channel = options.channel === undefined ? defaultChannel() : options.channel;
  channel?.addEventListener('message', (e) => {
    const d = e.data as { type?: unknown; from?: unknown } | null;
    // BroadcastChannel also reaches other stores in this same tab; only other tabs are worth a warning.
    if (d?.type === 'saved' && d.from !== self) say('Your save was changed in another tab. Reload this page to avoid overwriting it.');
  });
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
      channel?.postMessage({ type: 'saved', savedAt: stamped.savedAt, from: self });
    } catch {
      // other tabs just will not be warned
    }
    try {
      mirror?.setItem(SAVE_KEY, JSON.stringify(stamped));
    } catch {
      // the mirror is best effort; IndexedDB holds the truth
    }
    return stamped;
  };

  /** Newest backup that still migrates (the last 5 saves are kept), or undefined. */
  const newestGoodBackup = async (): Promise<SaveV1 | undefined> => {
    const d = await db();
    let cursor = await d.transaction('backups').store.openCursor(null, 'prev');
    while (cursor) {
      const m = migrate(cursor.value);
      if (m.ok) return m.value;
      cursor = await cursor.continue();
    }
    return undefined;
  };

  const current = async (): Promise<Result<SaveV1> | undefined> => {
    const d = await db();
    const raw = await d.get('saves', SLOT);
    if (raw === undefined) return undefined;
    const m = migrate(raw);
    if (m.ok || m.error.kind === 'future-version') return m;
    // The stored save is corrupt or fails validation: fall back to the newest good backup and say so.
    const backup = await newestGoodBackup();
    if (!backup) return m;
    await d.put('saves', backup, SLOT);
    say('Your save could not be read, so the most recent backup was restored. Some recent progress may be missing.');
    return { ok: true, value: backup };
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
