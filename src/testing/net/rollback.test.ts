import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { characterId } from '../../core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../core/flags';
import { LockstepSession, type LockstepOptions, type UpdateResult } from '../../core/net/session';
import { Cmd } from '../../core/sim/commands';
import { SimEventKind, type SimEvent } from '../../core/sim/events';
import { hash } from '../../core/sim/hash';
import { createMatch, type MatchSetup } from '../../core/sim/match';
import { EntityKind } from '../../core/sim/state';
import { step } from '../../core/sim/step';
import { hasEnded } from '../../core/sim/systems/end';
import type { SimWorld } from '../../core/sim/world';
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

  it('events are exactly the reference events for both sides', () => {
    const idOf = (e: SimEvent): string => `${String(e.tick)}:${String(e.sourceId)}:${String(e.kind)}:${String(e.seq)}`;
    const ref = new Map<string, string>();
    const rw = createMatch(SETUP);
    for (let t = 0; t < LIMIT; t++) {
      const c = (side: 0 | 1): number => (t < 2 ? 0 : (SCRIPT[side][t] ?? 0));
      for (const e of step(rw, [c(0), c(1)])) ref.set(idOf(e), JSON.stringify(e));
    }
    const shown: [Map<string, string>, Map<string, string>] = [new Map<string, string>(), new Map<string, string>()];
    let duplicates = 0;
    const p = play({
      conditions: lossy(0.1, 4),
      session: RB,
      onResult: (side, r) => {
        for (const e of r.retracted) shown[side].delete(idOf(e));
        for (const e of r.events) {
          if (shown[side].get(idOf(e)) === JSON.stringify(e)) duplicates++;
          shown[side].set(idOf(e), JSON.stringify(e));
        }
      },
    });
    expect(p.ss.map((s) => s.status)).toEqual(['ended', 'ended']);
    expect(p.ss[0].stats.rollbacks).toBeGreaterThan(0);
    expect(p.ss[1].stats.rollbacks).toBeGreaterThan(0);
    expect(duplicates).toBe(0);
    expect(shown[0]).toEqual(ref);
    expect(shown[1]).toEqual(ref);
  });

  it('a predicted win is retracted when a rollback removes it, and the match then runs on correctly', () => {
    let edited = false;
    let predictedEnd = 0;
    let unended = 0;
    let wasPending = false;
    let ended: SimEvent[] = [];
    let retractedEnd: SimEvent[] = [];
    const p = play({
      conditions: { ...PERFECT_NET, latency: 3, jitter: 3 },
      netSeed: 1,
      session: RB,
      before: (w, q) => {
        // Only peer 0 sees the enemy die at wall 40: a win on a predicted timeline that real inputs may undo.
        if (w === 40) {
          edited = true;
          const s = q.worlds[0].state;
          for (let id = 0; id < s.team.length; id++)
            if (s.team[id] === 1 && s.kind[id] === EntityKind.character) s.hp[id] = 0;
        }
        if (!edited) return;
        const now = hasEnded(q.worlds[0].state);
        if (wasPending && !now) unended++;
        wasPending = now && q.ss[0].status !== 'ended';
        if (wasPending) predictedEnd++;
      },
      onResult: (side, r) => {
        if (side !== 0) return;
        ended = ended.concat(r.events.filter((e) => e.kind === SimEventKind.matchEnded));
        retractedEnd = retractedEnd.concat(r.retracted.filter((e) => e.kind === SimEventKind.matchEnded));
      },
    });
    expect(predictedEnd).toBeGreaterThan(0);
    expect(unended).toBeGreaterThan(0);
    expect(ended.length).toBeGreaterThan(0);
    expect(retractedEnd.length).toBeGreaterThan(0);
    // Never final while predicted: the session ends only at the tick limit, as the reference run does.
    expect(p.ss.map((s) => s.status)).toEqual(['ended', 'ended']);
    expect(p.ss[0].winner).toBeNull();
    expect(p.ss[0].desync).toBeUndefined();
    expect(p.ss[1].desync).toBeUndefined();
    expect(p.hashes[0]).toBe(p.hashes[1]);
    expect(p.hashes[0]).toBe(referenceHash(SETUP, SCRIPT, LIMIT, 2));
  });

  it('a timeout while predicted ahead forfeits to the waiting side and stops stepping', () => {
    const p = play({
      conditions: { ...PERFECT_NET, latency: 2 },
      session: { ...RB, timeoutTicks: 40 },
      maxWall: 300,
      before: (w, q) => {
        if (w === 100) q.net.cut();
      },
    });
    const s = p.ss[0];
    expect(s.status).toBe('forfeit');
    expect(s.forfeitReason).toBe('timeout');
    expect(s.winner).toBe(0);
    expect(s.desync).toBeUndefined();
    expect(s.stats.predictedSteps).toBeGreaterThan(0);
    // Prediction never ran past the window beyond what the peer last confirmed, and nothing steps after the forfeit.
    expect(s.simTick).toBeLessThanOrEqual(100 + 2 + 8);
    const frozen = s.simTick;
    s.update(0);
    expect(s.simTick).toBe(frozen);
  });

  it('a concession received while predicted ahead is final and wins', () => {
    const p = play({
      conditions: { ...PERFECT_NET, latency: 5 },
      session: RB,
      maxWall: 300,
      before: (w, q) => {
        if (w === 100) q.ss[1].forfeit();
      },
    });
    expect(p.ss[1].status).toBe('forfeit');
    expect(p.ss[1].winner).toBe(0);
    expect(p.ss[0].status).toBe('forfeit');
    expect(p.ss[0].forfeitReason).toBe('remote-conceded');
    expect(p.ss[0].winner).toBe(0);
    expect(p.ss[0].desync).toBeUndefined();
  });

  it('a rollback during a remote pause corrects the state, and play resumes to the reference result', () => {
    let lastRollbacks = 0;
    let rollbacksWhilePaused = 0;
    let sawPaused = false;
    const p = play({
      conditions: { ...PERFECT_NET, latency: 6 },
      session: RB,
      skip: (w, side) => side === 1 && w > 100 && w <= 160,
      before: (w, q) => {
        if (w === 100) q.ss[1].setHidden(true);
        if (w === 160) q.ss[1].setHidden(false);
      },
      onResult: (side, _r, q) => {
        if (side !== 0) return;
        const rb = q.ss[0].stats.rollbacks;
        if (q.wall === 100) lastRollbacks = rb;
        if (q.wall <= 100 || q.wall > 160) return;
        if ((q.ss[0] as unknown as { remotePaused: boolean }).remotePaused) sawPaused = true;
        // Inputs already in flight when the peer paused still land during the pause and can force a rollback.
        rollbacksWhilePaused = rb - lastRollbacks;
      },
    });
    expect(sawPaused).toBe(true);
    expect(p.ss.map((s) => s.status)).toEqual(['ended', 'ended']);
    expect(p.ss[0].desync).toBeUndefined();
    expect(p.hashes[0]).toBe(p.hashes[1]);
    expect(p.hashes[0]).toBe(referenceHash(SETUP, SCRIPT, LIMIT, 2));
    // No rollback can happen while no inputs arrive; the corrections land once the peer resumes.
    expect(rollbacksWhilePaused).toBe(0);
    expect(p.ss[0].stats.rollbacks).toBeGreaterThan(lastRollbacks);
  });

  it('ring-size invariant: a restore never fails for any window 1..10, even when every tick is mispredicted', () => {
    const flip = SCRIPT[1].map((_, t) => (t % 2 === 0 ? Cmd.left : Cmd.right));
    const script = [SCRIPT[0], flip] as const;
    const ref = referenceHash(SETUP, script, 200, 2);
    for (let rollbackWindow = 1; rollbackWindow <= 10; rollbackWindow++) {
      const p = play({
        script,
        limit: 200,
        conditions: { ...PERFECT_NET, latency: 12, jitter: 6, loss: 0.1 },
        session: { adaptive: false, rollbackWindow },
      });
      const label = `window ${String(rollbackWindow)}`;
      expect(p.ss.map((s) => s.status), label).toEqual(['ended', 'ended']);
      expect(p.ss[0].desync, label).toBeUndefined();
      expect(p.ss[1].desync, label).toBeUndefined();
      expect(p.hashes, label).toEqual([ref, ref]);
      expect(p.ss[0].stats.maxRollbackDepth, label).toBeLessThanOrEqual(rollbackWindow);
    }
  });

  it('worst case: a rollback on every tick costs at most window + 1 sim steps per update', () => {
    const rollbackWindow = 10;
    const flip = SCRIPT[1].map((_, t) => (t % 2 === 0 ? Cmd.left : Cmd.right));
    const script = [SCRIPT[0], flip] as const;
    const p = play({
      script,
      limit: 300,
      conditions: { ...PERFECT_NET, latency: 9 },
      session: { adaptive: false, rollbackWindow },
    });
    const st = p.ss[0].stats;
    expect(p.ss[0].status).toBe('ended');
    expect(st.rollbacks).toBeGreaterThan(50);
    expect(st.resimTicks).toBeLessThanOrEqual(st.rollbacks * rollbackWindow);
    // Forward steps (at most one per update) plus re-simulated ticks: a generous count bound, no wall clock involved.
    expect(st.updates + st.resimTicks).toBeLessThanOrEqual(st.updates * (rollbackWindow + 1));
    expect(p.hashes[0]).toBe(referenceHash(SETUP, script, 300, 2));
  });

  it('bounded bookkeeping: old hashes are dropped, recent ones stay, and a late desync is still caught', () => {
    const long = 3000;
    const longScript = botScripts(SETUP, long + 200);
    let corrupt = false;
    const p = play({
      script: longScript,
      limit: long,
      conditions: lossy(0.05, 3),
      session: { ...RB, hashInterval: 5 },
      before: (w, q) => {
        if (w === 1)
          for (const world of q.worlds) {
            const s = world.state;
            for (let id = 0; id < s.team.length; id++)
              if (s.kind[id] === EntityKind.character) {
                s.hp[id] = 1e9;
                s.maxHp[id] = 1e9;
              }
          }
        if (corrupt) {
          corrupt = false;
          q.worlds[1].state.x[0] = (q.worlds[1].state.x[0] ?? 0) + 1;
        }
        if (w === 2500) corrupt = true;
      },
    });
    const s = p.ss[0];
    expect(s.hashAt(5)).toBeUndefined();
    expect(s.simTick).toBeGreaterThan(2400);
    expect(s.hashAt(Math.floor((s.simTick - 20) / 5) * 5)).toBeDefined();
    const internals = s as unknown as { local: { first: number }; remote: { first: number } };
    expect(internals.local.first).toBeGreaterThan(1000);
    expect(internals.remote.first).toBeGreaterThan(1000);
    // The late corruption was caught by a hash comparison made long after the early hashes were dropped.
    expect(p.ss.some((x) => x.desync !== undefined)).toBe(true);
  });
});

interface Played {
  readonly worlds: readonly [SimWorld, SimWorld];
  readonly ss: readonly [LockstepSession, LockstepSession];
  readonly net: ReturnType<typeof createFakePair>;
  wall: number;
}

interface PlayOptions {
  readonly script?: typeof SCRIPT;
  readonly limit?: number;
  readonly conditions: NetConditions;
  readonly netSeed?: number;
  readonly session: Partial<Omit<LockstepOptions, 'world' | 'side' | 'transport'>>;
  readonly maxWall?: number;
  /** Peers whose update is skipped this wall tick (a hidden tab). */
  readonly skip?: (wall: number, side: 0 | 1) => boolean;
  readonly before?: (wall: number, p: Played) => void;
  readonly onResult?: (side: 0 | 1, r: UpdateResult, p: Played) => void;
}

/** Like runNetMatch, but exposes every update result and can skip a peer's updates. */
function play(o: PlayOptions): Played & { hashes: readonly [number, number] } {
  const script = o.script ?? SCRIPT;
  const limit = o.limit ?? LIMIT;
  const worlds = [createMatch(SETUP), createMatch(SETUP)] as const;
  const net = createFakePair(o.netSeed ?? 7, o.conditions);
  const mk = (side: 0 | 1): LockstepSession =>
    new LockstepSession({ world: worlds[side], side, transport: side === 0 ? net.a : net.b, tickLimit: limit, ...o.session });
  const p: Played = { worlds, ss: [mk(0), mk(1)], net, wall: 0 };
  const done = new Set(['ended', 'desync', 'forfeit']);
  const max = o.maxWall ?? limit * 20;
  while (p.wall < max && !p.ss.every((s) => done.has(s.status))) {
    p.wall++;
    net.advance();
    o.before?.(p.wall, p);
    for (const s of p.ss) {
      if (o.skip?.(p.wall, s.side) === true) continue;
      const r = s.update(script[s.side][s.nextStampTick] ?? 0);
      o.onResult?.(s.side, r, p);
    }
  }
  return { ...p, hashes: [hash(worlds[0].state), hash(worlds[1].state)] };
}
