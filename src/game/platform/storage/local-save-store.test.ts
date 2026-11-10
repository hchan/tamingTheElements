import v0Fixture from '@fixtures/legacy/saves/v0-ch3.json';
import { describe, expect, it } from 'vitest';
import { BACKUP_KEY, SAVE_KEY, createMemoryStorage } from './save-store';
import { createLocalSaveStore } from './local-save-store';

const v0 = JSON.stringify(v0Fixture);

describe('local save store', () => {
  it('returns empty state when nothing is saved', async () => {
    const s = createLocalSaveStore(createMemoryStorage(), () => 5);
    const r = await s.load();
    expect(r.ok && r.value.schemaVersion).toBe(1);
  });

  it('migrates v0 once, backs it up raw and writes v1 back', async () => {
    const mem = createMemoryStorage({ [SAVE_KEY]: v0 });
    const s = createLocalSaveStore(mem, () => 99);
    expect((await s.load()).ok).toBe(true);
    expect(mem.getItem(BACKUP_KEY)).toBe(v0);
    const stored = JSON.parse(mem.getItem(SAVE_KEY) ?? '') as { schemaVersion: number; savedAt: number };
    expect(stored.schemaVersion).toBe(1);
    expect(stored.savedAt).toBe(99);
    mem.setItem(SAVE_KEY, v0);
    mem.setItem(BACKUP_KEY, 'first');
    await s.load();
    expect(mem.getItem(BACKUP_KEY)).toBe('first');
  });

  it('save stamps savedAt; clear removes', async () => {
    const mem = createMemoryStorage();
    const s = createLocalSaveStore(mem, () => 7);
    const r = await s.load();
    if (!r.ok) throw new Error('load');
    const saved = await s.save({ ...r.value, chapter: 3 });
    expect(saved.ok && saved.value.savedAt).toBe(7);
    expect(mem.getItem(BACKUP_KEY)).toBeNull();
    await s.clear();
    expect(mem.getItem(SAVE_KEY)).toBeNull();
  });

  it('reports corrupt and future-version saves without overwriting', async () => {
    const bad = createMemoryStorage({ [SAVE_KEY]: '{nope' });
    const r = await createLocalSaveStore(bad, () => 1).load();
    expect(!r.ok && r.error.kind).toBe('corrupt');
    expect(bad.getItem(SAVE_KEY)).toBe('{nope');
    const fut = createMemoryStorage({ [SAVE_KEY]: '{"schemaVersion":9}' });
    const f = await createLocalSaveStore(fut, () => 1).load();
    expect(!f.ok && f.error.kind).toBe('future-version');
  });

  it('exports and imports', async () => {
    const a = createLocalSaveStore(createMemoryStorage({ [SAVE_KEY]: v0 }), () => 1);
    const ex = await a.exportJson();
    if (!ex.ok) throw new Error('export');
    const b = createLocalSaveStore(createMemoryStorage(), () => 2);
    expect((await b.importJson(ex.value)).ok).toBe(true);
    expect((await b.importJson('nope')).ok).toBe(false);
  });

  it('surfaces storage failures', async () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error('denied');
      },
      setItem: (): void => undefined,
      removeItem: (): void => undefined,
    };
    const r = await createLocalSaveStore(broken, () => 1).load();
    expect(!r.ok && r.error.kind).toBe('storage');
  });
});
