import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReplayFile } from '@core/index';
import { getRecordSetting, setRecordSetting } from '../record-setting';
import { createReplayStore } from './replay-store';

const fake = (n: number): ReplayFile => ({ header: { tickCount: n } as ReplayFile['header'], inputs: [[], []], hashes: [], finalHash: n });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('replay store', () => {
  it('keeps only the newest N, newest first', async () => {
    const store = createReplayStore(() => 1, 5);
    for (let i = 1; i <= 7; i++) await store.add(fake(i));
    expect((await store.list()).map((e) => e.replay.finalHash)).toEqual([7, 6, 5, 4, 3]);
  });
});

describe('record setting', () => {
  it('defaults off and persists', () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(getRecordSetting(s)).toBe(false);
    setRecordSetting(true, s);
    expect(getRecordSetting(s)).toBe(true);
  });
});
