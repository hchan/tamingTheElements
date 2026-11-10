import { describe, expect, it } from 'vitest';
import golden from '../../../tests/fixtures/replays/random-vs-random.replay.json';
import { parseReplay, serializeReplay, HASH_INTERVAL, type ReplayFile } from './format';
import { playReplay } from './player';
import { GOLDEN_SETUP, recordBotMatch } from './record-bots';
import { rleDecode, rleEncode } from './rle';
import { SIM_VERSION } from '../version';

describe('rle', () => {
  it('round-trips and compresses runs', () => {
    const v = [0, 0, 0, 16, 16, 5, 0];
    expect(rleEncode(v)).toEqual([0, 3, 16, 2, 5, 1, 0, 1]);
    expect(rleDecode(rleEncode(v))).toEqual(v);
    expect(rleEncode([])).toEqual([]);
  });

  it('rejects malformed input', () => {
    expect(() => rleDecode([1])).toThrow();
    expect(() => rleDecode([0x10000, 1])).toThrow();
    expect(() => rleDecode([1, 0])).toThrow();
  });
});

describe('replay', () => {
  const file = parseReplay(JSON.stringify(golden));

  it('same seed and commands give the same hashes', () => {
    const a = recordBotMatch(GOLDEN_SETUP, 300);
    const b = recordBotMatch(GOLDEN_SETUP, 300);
    expect(serializeReplay(a)).toBe(serializeReplay(b));
    expect(a.hashes).toHaveLength(Math.ceil(300 / HASH_INTERVAL));
  });

  it('golden fixture verifies and matches a fresh recording', () => {
    expect(playReplay(file, SIM_VERSION)).toEqual({ ok: true, finalHash: file.finalHash });
    expect(file.header.tickCount).toBe(1500);
    expect(serializeReplay(recordBotMatch(GOLDEN_SETUP, file.header.tickCount))).toBe(serializeReplay(file));
  });

  it('reports the first divergent checkpoint', () => {
    const hashes = file.hashes.slice();
    hashes[4] = (hashes[4] as number) ^ 1;
    hashes[6] = (hashes[6] as number) ^ 1;
    const v = playReplay({ ...file, hashes });
    expect(v.ok).toBe(false);
    expect(v.firstDivergentTick).toBe(4 * HASH_INTERVAL);
  });

  it('detects a tampered input and a bad final hash', () => {
    const tampered: ReplayFile = { ...file, inputs: [[0x1f, file.header.tickCount], file.inputs[1]] };
    const v = playReplay(tampered);
    expect(v.ok).toBe(false);
    expect(v.firstDivergentTick).toBeLessThan(file.header.tickCount);
    const bad = playReplay({ ...file, finalHash: file.finalHash ^ 1 });
    expect(bad).toMatchObject({ ok: false, firstDivergentTick: file.header.tickCount });
  });

  it('rejects a simVersion mismatch', () => {
    expect(() => playReplay(file, SIM_VERSION + 1)).toThrow(/simVersion/);
  });
});
