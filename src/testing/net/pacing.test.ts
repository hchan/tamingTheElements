import { describe, expect, it } from 'vitest';
import { characterId } from '../../core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../core/flags';
import { FramePacer } from '../../core/net/pacing';
import { LockstepSession } from '../../core/net/session';
import { hash } from '../../core/sim/hash';
import { createMatch, type MatchSetup } from '../../core/sim/match';
import { botScripts } from './net-match';
import { createFakePair, type NetConditions } from './fake-transport';

const SETUP: MatchSetup = {
  simVersion: 1,
  seed: 0x5eed,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
};
const LIMIT = 1500;
const SCRIPT = botScripts(SETUP, LIMIT + 200);
const NET: NetConditions = { latency: 1, jitter: 0, loss: 0, duplicate: 0, reorder: 0, reorderDelay: 0 };

/** Peer 1 is called on only 9 of every 10 wall ticks (a slower machine); both peers may pace. */
function run(pace: boolean): { stalls: number; skipped: number; hashes: number[] } {
  const worlds = [createMatch(SETUP), createMatch(SETUP)] as const;
  const net = createFakePair(7, NET);
  const mk = (side: 0 | 1): LockstepSession =>
    new LockstepSession({ world: worlds[side], side, transport: side === 0 ? net.a : net.b, tickLimit: LIMIT, adaptive: false, inputDelay: 4 });
  const s = [mk(0), mk(1)] as const;
  const pacers = [new FramePacer(), new FramePacer()];
  for (let wall = 1; wall < LIMIT * 4 && !s.every((x) => x.status === 'ended'); wall++) {
    net.advance();
    for (const side of [0, 1] as const) {
      if (side === 1 && wall % 10 === 0) continue;
      const ses = s[side];
      if (pace && pacers[side]?.shouldSkip(ses.frameAdvantage())) continue;
      ses.update(SCRIPT[side][ses.nextStampTick] ?? 0);
    }
  }
  return {
    stalls: s[0].stats.stalls + s[1].stats.stalls,
    skipped: (pacers[0]?.skipped ?? 0) + (pacers[1]?.skipped ?? 0),
    hashes: worlds.map((w) => hash(w.state)),
  };
}

describe('frame-advantage pacing', () => {
  const plain = run(false);
  const paced = run(true);

  it('both runs finish with matching hashes, identical to each other', () => {
    expect(plain.hashes[0]).toBe(plain.hashes[1]);
    expect(paced.hashes[0]).toBe(paced.hashes[1]);
    expect(paced.hashes[0]).toBe(plain.hashes[0]);
  });

  it('stalls less than without pacing', () => {
    expect(paced.skipped).toBeGreaterThan(0);
    expect(paced.stalls).toBeLessThan(plain.stalls);
  });

  it('never skips at or below the threshold', () => {
    const p = new FramePacer();
    for (let i = 0; i < 1000; i++) expect(p.shouldSkip(i % 2)).toBe(false);
    expect(p.skipped).toBe(0);
  });
});
