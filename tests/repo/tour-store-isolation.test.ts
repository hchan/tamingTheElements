import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterId } from '../../src/core';
import { startRun } from '../../src/game/app/tour-model';
import { TOUR_KEY, clearRun, loadRun, saveRun } from '../../src/game/app/tour-store';
import { BACKUP_KEY, SAVE_KEY, createMemoryStorage } from '../../src/game/platform/storage/save-store';
import { TESTER_STORAGE_KEY } from '../../src/game/platform/tester/session';
import { MUTE_STORAGE_KEY } from '../../src/game/audio/arena-audio';

// World Tour (FUN-DESIGN 2.18) lives in its own key. It must not read or write the Classic save, the settings
// (they share the save key), the mute or record-playtests settings, or the Tester (cheats) state.
const root = resolve(import.meta.dirname, '../..');
const OTHER_KEYS = [SAVE_KEY, BACKUP_KEY, TESTER_STORAGE_KEY, MUTE_STORAGE_KEY, 'tte.recordPlaytests'];
const HERO = ['fiara', 'rokcore', 'curomo'] as CharacterId[];

describe('Tour store isolation', () => {
  it('its key differs from every other persisted key', () => {
    expect(OTHER_KEYS).not.toContain(TOUR_KEY);
  });

  it('the source imports no save store, settings, tester or audio module and names no other key', () => {
    const src = readFileSync(resolve(root, 'src/game/app/tour-store.ts'), 'utf8');
    const imports = src.split('\n').filter((l) => l.startsWith('import '));
    expect(imports).toEqual(["import { parseRun, serializeRun, type TourRun } from './tour-model';"]);
    expect(src).not.toMatch(/sessionStorage|indexedDB/);
    for (const k of OTHER_KEYS) expect(src).not.toContain(k);
  });

  it('never reads or writes other keys, and other keys never leak into the tour key', () => {
    const seen: string[] = [];
    const inner = createMemoryStorage({
      [SAVE_KEY]: '{"classic":true}',
      [BACKUP_KEY]: 'bak',
      [TESTER_STORAGE_KEY]: '{"cheats":true,"god":true}',
      [MUTE_STORAGE_KEY]: '1',
    });
    const spy = {
      getItem: (k: string) => (seen.push(k), inner.getItem(k)),
      setItem: (k: string, v: string) => {
        seen.push(k);
        inner.setItem(k, v);
      },
      removeItem: (k: string) => {
        seen.push(k);
        inner.removeItem(k);
      },
    };
    const before = OTHER_KEYS.map((k) => inner.getItem(k));
    expect(loadRun(spy)).toBeUndefined();
    saveRun(spy, startRun([...HERO], 7));
    loadRun(spy);
    clearRun(spy);
    expect(new Set(seen)).toEqual(new Set([TOUR_KEY]));
    expect(OTHER_KEYS.map((k) => inner.getItem(k))).toEqual(before);
    const saved = createMemoryStorage();
    saveRun(saved, startRun([...HERO], 7));
    expect(saved.getItem(TOUR_KEY)).not.toMatch(/cheat|god|tester/i);
  });
});
