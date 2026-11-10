import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newEmptyState } from '@core/index';
import { DB_NAME, createIdbSaveStore, type ChannelLike } from './idb-save-store';
import { notify, onNotice, resetNotices } from './notices';
import { createMemoryStorage } from './save-store';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetNotices();
});

function fakeChannel(): ChannelLike & { emit(data: unknown): void; posted: unknown[] } {
  const ls: ((e: { data: unknown }) => void)[] = [];
  return {
    posted: [],
    postMessage(m) {
      this.posted.push(m);
    },
    addEventListener: (_t, l) => void ls.push(l),
    close: () => undefined,
    emit: (data) => {
      for (const l of ls) l({ data });
    },
  };
}

describe('backup recovery', () => {
  it('restores the newest good backup when the stored save is corrupt, and says so', async () => {
    const notices: string[] = [];
    const s = createIdbSaveStore(createMemoryStorage(), () => 5, { channel: null, notify: (m) => notices.push(m) });
    await s.save({ ...newEmptyState(), chapter: 2 });
    await s.save({ ...newEmptyState(), chapter: 3 });
    // Corrupt the live record; the backups still hold the last good saves.
    const d = await openDB(DB_NAME);
    await d.put('saves', { schemaVersion: 1, chapter: 'garbage' }, 'main');
    d.close();
    const r = await s.load();
    expect(r.ok && r.value.chapter).toBe(3);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('backup');
    // The repaired save is now the live record.
    const again = await s.load();
    expect(again.ok && again.value.chapter).toBe(3);
    expect(notices).toHaveLength(1);
  });

  it('skips unusable backups and reports the error when none is good', async () => {
    const notices: string[] = [];
    const s = createIdbSaveStore(undefined, () => 5, { channel: null, notify: (m) => notices.push(m) });
    await s.save({ ...newEmptyState(), chapter: 1 });
    const d = await openDB(DB_NAME);
    await d.put('saves', { schemaVersion: 1, chapter: 'garbage' }, 'main');
    await d.clear('backups');
    await d.add('backups', { schemaVersion: 1, chapter: 'bad' });
    d.close();
    const r = await s.load();
    expect(r.ok).toBe(false);
    expect(notices).toEqual([]);
  });
});

describe('cross-tab guard', () => {
  it('announces a save and warns when another tab saved', async () => {
    const notices: string[] = [];
    const ch = fakeChannel();
    const s = createIdbSaveStore(createMemoryStorage(), () => 9, { channel: ch, notify: (m) => notices.push(m) });
    await s.save(newEmptyState());
    expect(ch.posted).toEqual([{ type: 'saved', savedAt: 9, from: expect.any(String) as string }]);
    const own = ch.posted[0];
    ch.emit(own);
    expect(notices).toEqual([]);
    expect(notices).toEqual([]);
    ch.emit({ type: 'saved', savedAt: 10 });
    expect(notices[0]).toContain('another tab');
    ch.emit({ type: 'other' });
    ch.emit(null);
    expect(notices).toHaveLength(1);
  });
});

describe('notices', () => {
  it('queues until a listener exists, then delivers and dedupes', () => {
    notify('a');
    notify('a');
    const seen = vi.fn();
    const off = onNotice(seen);
    expect(seen).toHaveBeenCalledTimes(1);
    notify('b');
    expect(seen).toHaveBeenLastCalledWith('b');
    off();
    notify('c');
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
