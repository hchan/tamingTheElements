import { describe, expect, it } from 'vitest';
import { getRecordSetting, setRecordSetting } from './record-setting';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const memory = (): { store: Store; data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, store: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) } };
};

describe('record playtests setting', () => {
  it('defaults to off (nothing is recorded unless the player opted in)', () => {
    expect(getRecordSetting(memory().store)).toBe(false);
    expect(getRecordSetting(undefined)).toBe(false);
  });

  it('round-trips on and off', () => {
    const { store } = memory();
    setRecordSetting(true, store);
    expect(getRecordSetting(store)).toBe(true);
    setRecordSetting(false, store);
    expect(getRecordSetting(store)).toBe(false);
  });

  it('only the exact stored value "1" counts as on', () => {
    const { store, data } = memory();
    data.set('tte.recordPlaytests', 'true');
    expect(getRecordSetting(store)).toBe(false);
  });

  it('survives storage that throws (private mode, quota)', () => {
    const boom: Store = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(getRecordSetting(boom)).toBe(false);
    expect(() => { setRecordSetting(true, boom); }).not.toThrow();
    expect(() => { setRecordSetting(true, undefined); }).not.toThrow();
  });
});
