import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_FLAGS } from '@core/index';
import { SAVE_KEY, createMemoryStorage, type SaveStore } from '../storage/save-store';
import { DEFAULT_TESTER_OPTIONS, TESTER_STORAGE_KEY, TesterSession, createTesterStore, parsePersisted } from './session';

const emptySave = { schemaVersion: 1 as const, savedAt: 1, chapter: 1, garrisonSortOrder: 1, difficulty: 1, displaySettings: 1, garrison: [] };

const mk = (): { session: TesterSession; real: ReturnType<typeof createMemoryStorage>; tab: ReturnType<typeof createMemoryStorage> } => {
  const real = createMemoryStorage({ [SAVE_KEY]: JSON.stringify(emptySave) });
  const tab = createMemoryStorage();
  return { session: new TesterSession(tab, real), real, tab };
};

const boom = (): Promise<never> => Promise.reject(new Error('the real store must not be touched'));

describe('TesterSession', () => {
  it('is off by default and changes nothing about the sim flags or the save source', () => {
    const { session, real } = mk();
    expect(session.enabled).toBe(false);
    expect(session.simFlags(DEFAULT_SIM_FLAGS)).toBe(DEFAULT_SIM_FLAGS);
    expect(session.tickCheats()).toEqual({ godMode: false, instantSwap: false });
    expect(session.saveStorage(real)).toBe(real);
    session.setOption('godMode', true);
    expect(session.options.godMode).toBe(false);
  });

  it('enabling seeds a throwaway slot from the real save and routes saves to it', () => {
    const { session, real } = mk();
    session.enable();
    expect(session.enabled).toBe(true);
    expect(session.options).toEqual(DEFAULT_TESTER_OPTIONS);
    expect(session.slotText()).toBe(real.getItem(SAVE_KEY));
    expect(session.saveStorage(real)).not.toBe(real);
    expect(session.simFlags(DEFAULT_SIM_FLAGS).testerCapture).toBe(true);
  });

  it('keeps cheat progress out of the real save unless "keep" is on', async () => {
    const { session, real } = mk();
    session.enable();
    const realBefore = real.getItem(SAVE_KEY);
    const trap: SaveStore = { load: boom, save: boom, clear: () => Promise.resolve(), exportJson: boom, importJson: boom };
    const store = createTesterStore(trap, session, () => 5);
    const loaded = await store.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    await store.save({ ...loaded.value, chapter: 4 });
    expect(real.getItem(SAVE_KEY)).toBe(realBefore);
    expect((JSON.parse(session.slotText() ?? '{}') as { chapter: number }).chapter).toBe(4);
  });

  it('with "keep" on, saves go to the real store', async () => {
    const { session } = mk();
    session.enable();
    session.setOption('keepProgress', true);
    let wrote = 0;
    const real: SaveStore = {
      load: boom,
      save: (s) => {
        wrote++;
        return Promise.resolve({ ok: true, value: s });
      },
      clear: () => Promise.resolve(),
      exportJson: boom,
      importJson: boom,
    };
    await createTesterStore(real, session, () => 5).save(emptySave);
    expect(wrote).toBe(1);
    expect(session.usesThrowawaySlot()).toBe(false);
  });

  it('persists per tab (sessionStorage) and disabling discards the slot', () => {
    const { session, real, tab } = mk();
    session.enable();
    session.setOption('instantSwap', true);
    const again = new TesterSession(tab, real);
    expect(again.enabled).toBe(true);
    expect(again.options.instantSwap).toBe(true);
    session.disable();
    expect(tab.getItem(TESTER_STORAGE_KEY)).toBeNull();
    expect(session.slotText()).toBeNull();
    expect(new TesterSession(tab, real).enabled).toBe(false);
  });

  it('turning "all abilities" off leaves the sim flags alone', () => {
    const { session } = mk();
    session.enable();
    session.setOption('allAbilities', false);
    expect(session.simFlags(DEFAULT_SIM_FLAGS).testerCapture).toBe(false);
  });

  it('notifies subscribers and tracks the arena bridge', () => {
    const { session } = mk();
    let n = 0;
    session.subscribe(() => {
      n++;
    });
    session.enable();
    const off = session.attachArena({ cheat: () => undefined, bench: () => [] });
    expect(session.arena).toBeDefined();
    off();
    expect(session.arena).toBeUndefined();
    expect(n).toBeGreaterThanOrEqual(3);
  });

  it('treats malformed persisted state as off', () => {
    expect(parsePersisted('nope').enabled).toBe(false);
    expect(parsePersisted(null).enabled).toBe(false);
    expect(parsePersisted('{"enabled":true,"options":{"godMode":"yes"}}').options.godMode).toBe(false);
  });
});
