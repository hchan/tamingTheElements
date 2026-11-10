import { describe, expect, it } from 'vitest';
import golden from '../fixtures/replays/random-vs-random.replay.json';
import { HASH_INTERVAL, parseReplay, serializeReplay } from '../../src/core/replay/format';
import { playReplay } from '../../src/core/replay/player';
import { GOLDEN_SETUP, recordBotMatch } from '../../src/core/replay/record-bots';

// Cross-engine determinism gate: the per-50-tick hashes committed from Node must be reproduced
// bit-for-bit by Chromium, Firefox and WebKit.
describe('cross-engine determinism', () => {
  const file = parseReplay(JSON.stringify(golden));

  it('golden replay verifies against the committed Node hashes', () => {
    expect(playReplay(file, 1)).toEqual({ ok: true, finalHash: file.finalHash });
  });

  it('a fresh recording reproduces the committed hashes at every checkpoint', () => {
    const fresh = recordBotMatch(GOLDEN_SETUP, file.header.tickCount);
    expect(fresh.hashes).toHaveLength(Math.ceil(file.header.tickCount / HASH_INTERVAL));
    for (let i = 0; i < file.hashes.length; i++) {
      // Reported per checkpoint so the first divergence is named in the failure.
      expect({ tick: i * HASH_INTERVAL, hash: fresh.hashes[i] }).toEqual({ tick: i * HASH_INTERVAL, hash: file.hashes[i] });
    }
    expect(fresh.finalHash).toBe(file.finalHash);
    expect(serializeReplay(fresh)).toBe(serializeReplay(file));
  });
});
