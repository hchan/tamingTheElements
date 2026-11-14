import { describe, expect, it } from 'vitest';
import { characterId } from '../../core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../core/flags';
import type { MatchSetup } from '../../core/sim/match';
import { botScripts, runNetMatch } from './net-match';
import { PERFECT_NET } from './fake-transport';

const SETUP: MatchSetup = {
  simVersion: 1,
  seed: 0x5eed,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
};
// Longer than the 64-entry hash history x 50 ticks, so the full log must outlive the history.
const LIMIT = 3700;
const SCRIPT = botScripts(SETUP, LIMIT + 200);

describe('LockstepSession.checkpoints()', () => {
  for (const [name, session] of [
    ['lockstep', { adaptive: false }],
    ['rollback', { adaptive: false, rollbackWindow: 8 }],
  ] as const) {
    it(`two sessions end with equal checkpoint lists (${name})`, () => {
      const r = runNetMatch({ setup: SETUP, script: SCRIPT, tickLimit: LIMIT, conditions: { ...PERFECT_NET, latency: 2 }, netSeed: 3, session });
      const a = r.sessions[0].checkpoints();
      const b = r.sessions[1].checkpoints();
      expect(r.sessions.map((s) => s.status)).toEqual(['ended', 'ended']);
      expect(a.length).toBeGreaterThan(64);
      expect(a).toEqual(b);
      // Strictly increasing ticks; the newest entry is what hashAt reports.
      for (let i = 1; i < a.length; i++) expect((a[i] as readonly [number, number])[0]).toBeGreaterThan((a[i - 1] as readonly [number, number])[0]);
      const last = a[a.length - 1] as readonly [number, number];
      expect(r.sessions[0].hashAt(last[0])).toBe(last[1]);
    });
  }

  it('is a copy: mutating the result does not change the session', () => {
    const r = runNetMatch({ setup: SETUP, script: SCRIPT, tickLimit: 300, conditions: PERFECT_NET, netSeed: 1 });
    const first = r.sessions[0].checkpoints() as [number, number][];
    const n = first.length;
    first.length = 0;
    expect(r.sessions[0].checkpoints()).toHaveLength(n);
  });
});
