import { openDB, type DBSchema } from 'idb';
import type { ReplayFile } from '@core/index';

export const REPLAY_DB = 'tte-replays';
export const MAX_REPLAYS = 5;

interface StoredReplay {
  readonly savedAt: number;
  readonly replay: ReplayFile;
}

interface ReplayDb extends DBSchema {
  replays: { key: number; value: StoredReplay };
}

export interface ReplayEntry extends StoredReplay {
  readonly id: number;
}

export interface ReplayStore {
  /** Adds a replay and drops the oldest beyond the cap. */
  add(replay: ReplayFile): Promise<void>;
  /** Newest first. */
  list(): Promise<ReplayEntry[]>;
}

/** Local-only IndexedDB store (its own database, so the save database is untouched). Used only when recording is enabled. */
export function createReplayStore(now: () => number, max: number = MAX_REPLAYS, name: string = REPLAY_DB): ReplayStore {
  let dbPromise: ReturnType<typeof openDB<ReplayDb>> | undefined;
  const db = (): ReturnType<typeof openDB<ReplayDb>> =>
    (dbPromise ??= openDB<ReplayDb>(name, 1, {
      upgrade: (d) => {
        d.createObjectStore('replays', { autoIncrement: true });
      },
    }));
  return {
    async add(replay) {
      const d = await db();
      const tx = d.transaction('replays', 'readwrite');
      await tx.store.add({ savedAt: now(), replay });
      const keys = await tx.store.getAllKeys();
      for (const k of keys.slice(0, Math.max(0, keys.length - max))) await tx.store.delete(k);
      await tx.done;
    },
    async list() {
      const d = await db();
      const keys = await d.getAllKeys('replays');
      const out: ReplayEntry[] = [];
      for (const id of keys) {
        const v = await d.get('replays', id);
        if (v) out.push({ id, ...v });
      }
      return out.reverse();
    },
  };
}
