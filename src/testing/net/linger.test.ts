import { describe, expect, it } from 'vitest';
import { characterId } from '../../core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../core/flags';
import { LockstepSession } from '../../core/net/session';
import { createMatch, type MatchSetup } from '../../core/sim/match';
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
const LIMIT = 120;
const LOSSY: NetConditions = { latency: 2, jitter: 3, loss: 0.4, duplicate: 0, reorder: 0, reorderDelay: 0 };

/**
 * Plays a short match the way the Arena does: a session that has ended stops being updated. With `linger` it keeps being
 * updated (receive and resend only) until the peer ends too. Returns how many of `seeds` left a peer stuck.
 */
function stuckMatches(seeds: number, linger: boolean): number {
  let stuck = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const net = createFakePair(seed, LOSSY);
    const mk = (side: 0 | 1): LockstepSession =>
      new LockstepSession({ world: createMatch(SETUP), side, transport: side === 0 ? net.a : net.b, tickLimit: LIMIT, adaptive: false, timeoutTicks: 100000 });
    const s = [mk(0), mk(1)] as const;
    for (let wall = 0; wall < 5000 && !(s[0].status === 'ended' && s[1].status === 'ended'); wall++) {
      net.advance();
      for (const x of s) if (linger || x.status !== 'ended') x.update(0);
    }
    if (s[0].status !== 'ended' || s[1].status !== 'ended') stuck++;
  }
  return stuck;
}

describe('a finished online side keeps talking until the peer has finished too', () => {
  it('a side that goes silent at its own match end can strand the peer one input short', () => {
    expect(stuckMatches(40, false)).toBeGreaterThan(0);
  });
  it('a side that keeps updating after its end (the Arena linger) always lets the peer finish', () => {
    expect(stuckMatches(40, true)).toBe(0);
  });
});
