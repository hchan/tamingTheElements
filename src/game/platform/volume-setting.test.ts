import { describe, expect, it } from 'vitest';
import { DEFAULT_VOLUMES, VOLUME_KEY, readVolumes, writeVolume } from './volume-setting';

const store = (initial?: string) => {
  const m = new Map<string, string>(initial === undefined ? [] : [[VOLUME_KEY, initial]]);
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('volume setting', () => {
  it('defaults to full volume with nothing stored, and for junk', () => {
    expect(readVolumes(store())).toEqual(DEFAULT_VOLUMES);
    expect(readVolumes(store('not json'))).toEqual(DEFAULT_VOLUMES);
    expect(readVolumes(store('{"music":"loud","sfx":null}'))).toEqual(DEFAULT_VOLUMES);
    expect(readVolumes(undefined)).toEqual(DEFAULT_VOLUMES);
  });

  it('round-trips one bus at a time and clamps to 0..1', () => {
    const s = store();
    expect(writeVolume('music', 0.4, s)).toEqual({ music: 0.4, sfx: 1 });
    writeVolume('sfx', 7, s);
    expect(readVolumes(s)).toEqual({ music: 0.4, sfx: 1 });
    writeVolume('sfx', -2, s);
    expect(readVolumes(s)).toEqual({ music: 0.4, sfx: 0 });
  });

  it('survives a storage that throws', () => {
    const bad = {
      getItem: (): string | null => {
        throw new Error('x');
      },
      setItem: (): void => {
        throw new Error('x');
      },
    };
    expect(readVolumes(bad)).toEqual(DEFAULT_VOLUMES);
    expect(writeVolume('music', 0.5, bad)).toEqual({ music: 0.5, sfx: 1 });
  });
});
