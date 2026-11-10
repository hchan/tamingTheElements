import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { characterId } from '../../core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../core/flags';
import { LockstepSession } from '../../core/net/session';
import { hash } from '../../core/sim/hash';
import { createMatch } from '../../core/sim/match';
import { decodePacket, encodePacket, PacketFlag } from '../../core/net/packet';
import type { MatchSetup } from '../../core/sim/match';
import { botScripts, referenceHash, runNetMatch, type NetMatchOptions } from './net-match';
import { FakeNetwork, PERFECT_NET, type NetConditions } from './fake-transport';

const SETUP: MatchSetup = {
  simVersion: 1,
  seed: 0x5eed,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
};
const LIMIT = 1200;
const SCRIPT = botScripts(SETUP, LIMIT + 200);
const base = { setup: SETUP, script: SCRIPT, tickLimit: LIMIT, netSeed: 7, session: { adaptive: false } } as const;

function lossy(loss: number): NetConditions {
  return { latency: 3, jitter: 4, loss, duplicate: 0.05, reorder: 0.1, reorderDelay: 6 };
}

/** Checkpoint hashes both peers recorded must be identical at every checkpoint tick. */
function checkpointsAgree(r: ReturnType<typeof runNetMatch>): number {
  let n = 0;
  for (let t = 1; t <= LIMIT; t++) {
    const a = r.sessions[0].hashAt(t);
    const b = r.sessions[1].hashAt(t);
    if (a === undefined && b === undefined) continue;
    expect(a, `tick ${String(t)}`).toBe(b);
    n++;
  }
  return n;
}

describe('packet codec', () => {
  it('round-trips and rejects garbage', () => {
    const p = { flags: PacketFlag.paused, ack: 9, firstTick: 4, inputs: [1, 2, 0x7ff], hashes: [{ tick: 50, hash: 0xdeadbeef }] };
    expect(decodePacket(encodePacket(p))).toEqual(p);
    expect(decodePacket(new Uint8Array(3))).toBeUndefined();
    const bad = encodePacket(p);
    expect(decodePacket(bad.subarray(0, bad.length - 1))).toBeUndefined();
  });
});

describe('FakeTransport', () => {
  it('is deterministic per seed and honours latency and loss', () => {
    const run = (seed: number): number[] => {
      const n = new FakeNetwork(seed, { ...PERFECT_NET, latency: 2, loss: 0.5 });
      for (let i = 0; i < 40; i++) n.a.send(new Uint8Array([i]));
      const got: number[] = [];
      expect(n.b.receive()).toBeUndefined();
      n.advance();
      n.advance();
      for (let p = n.b.receive(); p; p = n.b.receive()) got.push(p[0] as number);
      return got;
    };
    expect(run(1)).toEqual(run(1));
    expect(run(1).length).toBeGreaterThan(5);
    expect(run(1).length).toBeLessThan(35);
  });
});

describe('lockstep bot-vs-bot', () => {
  for (const loss of [0, 0.1, 0.3]) {
    it(`agrees at every checkpoint with ${String(loss * 100)}% loss, jitter and reordering`, () => {
      const r = runNetMatch({ ...base, conditions: lossy(loss) });
      expect(r.sessions.map((s) => s.status)).toEqual(['ended', 'ended']);
      expect(r.sessions[0].desync).toBeUndefined();
      expect(r.sessions[1].desync).toBeUndefined();
      expect(checkpointsAgree(r)).toBeGreaterThan(10);
      expect(r.sessions[0].winner).toBe(r.sessions[1].winner);
      expect(r.hashes[0]).toBe(r.hashes[1]);
      expect(r.hashes[0]).toBe(referenceHash(SETUP, SCRIPT, LIMIT, 2));
      if (loss > 0) expect(r.sessions[0].stats.resentInputs).toBeGreaterThan(0);
    });
  }

  it('property: same commands give the same final hash whatever the network does', () => {
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
      fc.property(cond, fc.integer({ min: 1, max: 1e6 }), (conditions, netSeed) => {
        const r = runNetMatch({ ...base, tickLimit: short, conditions, netSeed });
        expect(r.sessions.map((s) => s.status)).toEqual(['ended', 'ended']);
        expect(r.hashes).toEqual([ref, ref]);
      }),
      { numRuns: 25 },
    );
  });

  it('adaptive delay rises under latency and both sides stay in sync', () => {
    const r = runNetMatch({ ...base, session: { adaptive: true }, conditions: { ...PERFECT_NET, latency: 4, jitter: 3 } });
    expect(r.sessions[0].inputDelay).toBeGreaterThan(2);
    expect(r.sessions[0].desync).toBeUndefined();
    expect(r.hashes[0]).toBe(r.hashes[1]);
  });

  it('stalls (reports waiting) while the peer is silent', () => {
    const r = runNetMatch({
      ...base,
      conditions: PERFECT_NET,
      session: { adaptive: false, timeoutTicks: 1e9 },
      maxWallTicks: 400,
      beforeTick: (w, h) => {
        if (w === 100) h.net.cut();
      },
    });
    expect(r.sessions[0].status).toBe('waiting');
    expect(r.sessions[0].stats.maxStallRun).toBeGreaterThan(200);
    expect(r.sessions[0].simTick).toBeLessThan(110);
  });
});

describe('desync detection', () => {
  it('flags the first checkpoint after one side is corrupted', () => {
    const r = runNetMatch({
      ...base,
      conditions: lossy(0.1),
      beforeTick: (_w, h) => {
        if (h.sessions[1].simTick === 120 && h.worlds[1].state.hp[0] !== 1) h.worlds[1].state.hp[0] = 1;
      },
    });
    for (const s of r.sessions) {
      expect(s.status).toBe('desync');
      expect(s.desync?.tick).toBe(150);
    }
  });
});

describe('timeout, forfeit and hidden-tab policy', () => {
  const cut = (at: number): NetMatchOptions['beforeTick'] => (w, h) => {
    if (w === at) h.net.cut();
  };

  it('forfeits the silent peer after timeoutTicks', () => {
    const r = runNetMatch({ ...base, conditions: PERFECT_NET, session: { adaptive: false, timeoutTicks: 100 }, beforeTick: cut(50) });
    for (const s of r.sessions) {
      expect(s.status).toBe('forfeit');
      expect(s.forfeitReason).toBe('timeout');
      expect(s.winner).toBe(s.side);
    }
  });

  it('a hidden-tab pause message extends the timeout and the match resumes', () => {
    const worlds = [createMatch(SETUP), createMatch(SETUP)] as const;
    const net = new FakeNetwork(3, PERFECT_NET);
    const opts = { adaptive: false, timeoutTicks: 100, pauseTimeoutTicks: 1000, tickLimit: 300 };
    const a = new LockstepSession({ ...opts, world: worlds[0], side: 0, transport: net.a });
    const b = new LockstepSession({ ...opts, world: worlds[1], side: 1, transport: net.b });
    const tick = (...ss: LockstepSession[]): void => {
      net.advance();
      for (const s of ss) s.update(SCRIPT[s.side][s.nextStampTick] ?? 0);
    };
    for (let i = 0; i < 30; i++) tick(a, b);
    b.setHidden(true); // the browser throttles the hidden tab: b stops updating
    for (let i = 0; i < 400; i++) tick(a);
    expect(a.status).toBe('remote-paused');
    b.setHidden(false);
    for (let i = 0; i < 2000 && (a.status !== 'ended' || b.status !== 'ended'); i++) tick(a, b);
    expect([a.status, b.status]).toEqual(['ended', 'ended']);
    expect(hash(worlds[0].state)).toBe(hash(worlds[1].state));
  });

  it('a conceded match ends for both sides', () => {
    const r = runNetMatch({
      ...base,
      conditions: PERFECT_NET,
      beforeTick: (w, h) => {
        if (w === 80) h.sessions[1].forfeit();
      },
    });
    expect(r.sessions[1].forfeitReason).toBe('conceded');
    expect(r.sessions[1].winner).toBe(0);
    expect(r.sessions[0].forfeitReason).toBe('remote-conceded');
    expect(r.sessions[0].winner).toBe(0);
  });
});
