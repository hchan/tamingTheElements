/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import type { MatchSetup } from '../../src/core/sim/match';
import { HASH_INTERVAL, parseReplay, serializeReplay } from '../../src/core/replay/format';
import { playReplay } from '../../src/core/replay/player';
import { GOLDEN_SETUP, recordBotMatch } from '../../src/core/replay/record-bots';
import { SIM_VERSION } from '../../src/core/version';

// Cross-engine determinism gate: the per-50-tick hashes committed from Node must be reproduced
// bit-for-bit by Chromium, Firefox and WebKit.
describe('cross-engine determinism', () => {
  // Every committed golden is picked up by glob, so a newly recorded replay cannot be left out of the cross-engine gate.
  const all = import.meta.glob<unknown>('../fixtures/replays/*.replay.json', { eager: true, import: 'default' });
  const file = parseReplay(JSON.stringify(all['../fixtures/replays/random-vs-random.replay.json']));

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

  const names = Object.keys(all).map((p) => p.replace(/^.*\//, '').replace('.replay.json', ''));

  it('covers the Classic and every Arcade golden', () => {
    expect(names).toEqual(
      expect.arrayContaining([
        'random-vs-random', 'random-2v2-ch3', 'arcade-1v1', 'arcade-moves', 'arcade-weather',
        'arcade-tag', 'arcade-tag3', 'arcade-traps', 'arcade-elemental',
      ]),
    );
  });

  it.each(Object.entries(all))('golden %s is at the current SIM_VERSION and verifies against the committed Node hashes', (path, raw) => {
    const replay = parseReplay(JSON.stringify(raw));
    expect(replay.header.simVersion, path).toBe(SIM_VERSION);
    expect(playReplay(replay, SIM_VERSION), path).toEqual({ ok: true, finalHash: replay.finalHash });
  });

  // Second Classic golden: two-hero rosters, chapter 3 (same setup as tools/gen/record-golden.ts SETUP_2V2).
  it('a fresh 2v2 chapter-3 recording reproduces the committed replay byte for byte', () => {
    const setup: MatchSetup = {
      simVersion: SIM_VERSION,
      seed: 0xbeef,
      flags: DEFAULT_SIM_FLAGS,
      chapter: 3,
      difficulty: 2,
      p1: [{ character: characterId('curomo'), xp: 30 }, { character: characterId('fiara'), xp: 10 }],
      p2: [{ character: characterId('pax'), xp: 30 }, { character: characterId('cyclonius'), xp: 10 }],
    };
    const committed = parseReplay(JSON.stringify(all['../fixtures/replays/random-2v2-ch3.replay.json']));
    const fresh = recordBotMatch(setup, committed.header.tickCount);
    expect(fresh.finalHash).toBe(committed.finalHash);
    expect(serializeReplay(fresh)).toBe(serializeReplay(committed));
  });
});
