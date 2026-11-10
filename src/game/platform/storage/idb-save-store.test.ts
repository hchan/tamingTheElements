import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import v0Fixture from '@fixtures/legacy/saves/v0-ch3.json';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newEmptyState } from '@core/index';
import { DB_NAME, createIdbSaveStore, requestPersistence, resetPersistenceRequest } from './idb-save-store';
import { SAVE_KEY, createMemoryStorage } from './save-store';

beforeEach(() => {
  // a fresh factory per test; open connections from earlier tests would block deleteDatabase
  globalThis.indexedDB = new IDBFactory();
  resetPersistenceRequest();
});

describe('idb save store', () => {
  it('empty when nothing saved', async () => {
    const r = await createIdbSaveStore(createMemoryStorage(), () => 1).load();
    expect(r.ok && r.value.schemaVersion).toBe(1);
  });

  it('imports legacy localStorage once and keeps the mirror', async () => {
    const mem = createMemoryStorage({ [SAVE_KEY]: JSON.stringify(v0Fixture) });
    const s = createIdbSaveStore(mem, () => 7);
    const r = await s.load();
    expect(r.ok && r.value.savedAt).toBe(7);
    expect(r.ok && r.value.chapter).toBe(3);
    mem.setItem(SAVE_KEY, '{"bogus":1}');
    const again = await s.load();
    expect(again.ok && again.value.chapter).toBe(3);
  });

  it('save writes the mirror and keeps only 5 backups', async () => {
    const mem = createMemoryStorage();
    const s = createIdbSaveStore(mem, () => 2);
    for (let i = 0; i < 8; i++) await s.save({ ...newEmptyState(), chapter: i });
    const stored = JSON.parse(mem.getItem(SAVE_KEY) ?? '') as { chapter: number };
    expect(stored.chapter).toBe(7);
    const d = await openDB(DB_NAME);
    expect(await d.count('backups')).toBe(5);
    expect(await d.get('saves', 'main')).toMatchObject({ chapter: 7 });
    d.close();
  });

  it('export/import round trips and clear empties', async () => {
    const mem = createMemoryStorage();
    const s = createIdbSaveStore(mem, () => 3);
    await s.save({ ...newEmptyState(), chapter: 4 });
    const text = await s.exportJson();
    await s.clear();
    expect(mem.getItem(SAVE_KEY)).toBeNull();
    const cleared = await s.load();
    expect(cleared.ok && cleared.value.chapter).toBe(0);
    expect((await s.importJson(text.ok ? text.value : '')).ok).toBe(true);
    const r = await s.load();
    expect(r.ok && r.value.chapter).toBe(4);
    expect((await s.importJson('nope')).ok).toBe(false);
  });
});

describe('requestPersistence', () => {
  it('asks once', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    const st = { persist, persisted: () => Promise.resolve(false) };
    expect(await requestPersistence(st)).toBe(true);
    expect(await requestPersistence(st)).toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
