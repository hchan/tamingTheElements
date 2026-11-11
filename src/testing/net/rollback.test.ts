import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { characterId } from '../../core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../core/flags';
import { LockstepSession } from '../../core/net/session';
import type { SimEvent } from '../../core/sim/events';
import { createMatch, type MatchSetup } from '../../core/sim/match';
import { step } from '../../core/sim/step';
import { botScripts, referenceHash, runNetMatch } from './net-match';
import { createFakePair, PERFECT_NET, type NetConditions } from './fake-transport';

const SETUP: MatchSetup = {
  simVersion: 1,
  seed: 0x5eed,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
};
const LIMIT = 600;
const SCRIPT = botScripts(SETUP, LIMIT + 200);
const base = { setup: SETUP, script: SCRIPT, tickLimit: LIMIT, netSeed: 7 } as const;
const RB = { adaptive: false, rollbackWindow: 8 } as const;

function lossy(loss: number, latency = 3): NetConditions {
  return { latency, jitter: 4, loss, duplicate: 0.05, reorder: 0.1, reorderDelay: 6 };
}

describe('rollback netcode (opt-in)', () => {
  for (const loss of [0, 0.2]) {
    it(`ends with equal hashes equal to the reference run (latency, ${String(loss * 100)}% loss)`, () => {
      const r = runNetMatch({ ...base, session: RB, conditions: lossy(loss) });
      expect(r.sessions.map((s) => s.status)).toEqual(['ended', 'ended']);
      expect(r.sessions[0].desync).toBeUndefined();
      expect(r.sessions[1].desync).toBeUndefined();
      expect(r.hashes[0]).toBe(r.hashes[1]);
      expect(r.hashes[0]).toBe(referenceHash(SETUP, SCRIPT, LIMIT, 2));
      expect(r.sessions[0].winner).toBe(r.sessions[1].winner);
      let n = 0;
      for (let t = 1; t <= LIMIT; t++) {
        const a = r.sessions[0].hashAt(t);
        const b = r.sessions[1].hashAt(t);
        if (a === undefined && b === undefined) continue;
        expect(a, `tick ${String(t)}`).toBe(b);
        n++;
      }
      expect(n).toBeGreaterThan(5);
      const st = r.sessions[0].stats;
      expect(st.predictedSteps).toBeGreaterThan(0);
      expect(st.rollbacks).toBeGreaterThan(0);
      expect(st.resimTicks).toBeGreaterThan(0);
      expect(st.maxRollbackDepth).toBeLessThanOrEqual(8);
    });
  }

  it('hides latency: stalls less than plain lockstep under the same network', () => {
    const cond = lossy(0.1, 5);
    const plain = runNetMatch({ ...base, session: { adaptive: false }, conditions: cond });
    const rb = runNetMatch({ ...base, session: RB, conditions: cond });
    expect(rb.sessions[0].stats.stalls).toBeLessThan(plain.sessions[0].stats.stalls);
    expect(rb.hashes[0]).toBe(plain.hashes[0]);
  });

  it('is off by default: no prediction, no rollback', () => {
    const r = runNetMatch({ ...base, session: { adaptive: false }, conditions: lossy(0.1) });
    expect(r.sessions[0].stats.predictedSteps).toBe(0);
    expect(r.sessions[0].stats.rollbacks).toBe(0);
  });

  it('property: any network gives the reference hash and no desync', () => {
    const cond = fc.record({
      latency: fc.integer({ min: 0, max: 8 }),
      jitter: fc.integer({ min: 0, max: 10 }),
      loss: fc.double({ min: 0, max: 0.4, noNaN: true }),
      duplicate: fc.double({ min: 0, max: 0.3, noNaN: true }),
      reorder: fc.double({ min: 0, max: 0.5, noNaN: true }),
      reorderDelay: fc.integer({ min: 0, max: 12 }),
    });
    const short = 300;
    const ref = referenceHash(SETUP, SCRIPT, short, 2);
    fc.assert(
      fc.property(cond, fc.integer({ min: 1, max: 1e6 }), fc.integer({ min: 1, max: 10 }), (conditions, netSeed, rollbackWindow) => {
        const r = runNetMatch({ ...base, tickLimit: short, conditions, netSeed, session: { adaptive: false, rollbackWindow } });
        expect(r.sessions.map((s) => s.status)).toEqual(['ended', 'ended']);
        expect(r.hashes).toEqual([ref, ref]);
      }),
      { numRuns: 15 },
    );
  });

  it('falls back to waiting when the window is exhausted', () => {
    const r = runNetMatch({
      ...base,
      conditions: PERFECT_NET,
      session: { ...RB, timeoutTicks: 1e9 },
      maxWallTicks: 400,
      beforeTick: (w, h) => {
        if (w === 100) h.net.cut();
      },
    });
    const s = r.sessions[0];
    expect(s.status).toBe('waiting');
    expect(s.stats.maxStallRun).toBeGreaterThan(200);
    // Never more than the window beyond what the peer last confirmed (about tick 100 plus its input delay).
    expect(s.simTick).toBeLessThanOrEqual(100 + 2 + 8);
    expect(s.simTick).toBeGreaterThan(100);
    expect(s.stats.predictedSteps).toBeGreaterThan(0);
  });

  it('a window smaller than the latency still stalls but stays correct', () => {
    const r = runNetMatch({ ...base, session: { adaptive: false, rollbackWindow: 1 }, conditions: lossy(0.1, 10) });
    expect(r.sessions[0].stats.stalls).toBeGreaterThan(0);
    expect(r.hashes[0]).toBe(r.hashes[1]);
    expect(r.hashes[0]).toBe(referenceHash(SETUP, SCRIPT, LIMIT, 2));
  });

  it('does not deliver an event twice; delivered minus retracted equals the reference events', () => {
    const idOf = (e: SimEvent): string => `${String(e.tick)}:${String(e.sourceId)}:${String(e.kind)}:${String(e.seq)}`;
    const ref = new Map<string, string>();
    const rw = createMatch(SETUP);
    for (let t = 0; t < LIMIT; t++) {
      const c = (side: 0 | 1): number => (t < 2 ? 0 : (SCRIPT[side][t] ?? 0));
      for (const e of step(rw, [c(0), c(1)])) ref.set(idOf(e), JSON.stringify(e));
    }
    const worlds = [createMatch(SETUP), createMatch(SETUP)] as const;
    const net = createFakePair(7, lossy(0.1, 4));
    const ss = [
      new LockstepSession({ world: worlds[0], side: 0, transport: net.a, tickLimit: LIMIT, ...RB }),
      new LockstepSession({ world: worlds[1], side: 1, transport: net.b, tickLimit: LIMIT, ...RB }),
    ] as const;
    const shown = new Map<string, string>();
    let duplicates = 0;
    for (let w = 0; w < LIMIT * 20 && ss[0].status !== 'ended'; w++) {
      net.advance();
      for (const s of ss) {
        const r = s.update(SCRIPT[s.side][s.nextStampTick] ?? 0);
        if (s.side !== 0) continue;
        for (const e of r.retracted) shown.delete(idOf(e));
        for (const e of r.events) {
          if (shown.get(idOf(e)) === JSON.stringify(e)) duplicates++;
          shown.set(idOf(e), JSON.stringify(e));
        }
      }
    }
    expect(ss[0].stats.rollbacks).toBeGreaterThan(0);
    expect(ref.size).toBeGreaterThan(0);
    expect(duplicates).toBe(0);
    expect(shown).toEqual(ref);
  });
});
