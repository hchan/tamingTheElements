import { describe, expect, it } from 'vitest';
import arcadeGolden from '../fixtures/replays/arcade-1v1.replay.json';
import arcadeMovesGolden from '../fixtures/replays/arcade-moves.replay.json';
import arcadeTagGolden from '../fixtures/replays/arcade-tag.replay.json';
import arcadeWeatherGolden from '../fixtures/replays/arcade-weather.replay.json';
import golden from '../fixtures/replays/random-vs-random.replay.json';
import { HASH_INTERVAL, parseReplay, serializeReplay } from '../../src/core/replay/format';
import { playReplay } from '../../src/core/replay/player';
import { GOLDEN_SETUP, recordBotMatch } from '../../src/core/replay/record-bots';
import { SIM_VERSION } from '../../src/core/version';

// Cross-engine determinism gate: the per-50-tick hashes committed from Node must be reproduced
// bit-for-bit by Chromium, Firefox and WebKit.
describe('cross-engine determinism', () => {
  const file = parseReplay(JSON.stringify(golden));

  it('golden replay verifies against the committed Node hashes', () => {
    expect(playReplay(file, SIM_VERSION)).toEqual({ ok: true, finalHash: file.finalHash });
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

  it('the Arcade golden verifies against the committed Node hashes', () => {
    const arcade = parseReplay(JSON.stringify(arcadeGolden));
    expect(playReplay(arcade, SIM_VERSION)).toEqual({ ok: true, finalHash: arcade.finalHash });
  });

  // Hand-scripted inputs (tools/gen/arcade-moves.ts): dash, guard, parry, super, all five weathers, the round flow and
  // the 2v2 tag team.
  it.each([['arcade-moves', arcadeMovesGolden], ['arcade-weather', arcadeWeatherGolden], ['arcade-tag', arcadeTagGolden]])(
    'the scripted Arcade golden %s verifies against the committed Node hashes',
    (_name, golden) => {
      const scripted = parseReplay(JSON.stringify(golden));
      expect(playReplay(scripted, SIM_VERSION)).toEqual({ ok: true, finalHash: scripted.finalHash });
    },
  );
});
