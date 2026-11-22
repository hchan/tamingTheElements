import { describe, expect, it } from 'vitest';
import {
  BATCH_AHEAD_SLACK,
  characterId,
  createMatch,
  DEFAULT_SIM_FLAGS,
  encodePacket,
  LockstepSession,
  MAX_INPUTS_PER_PACKET,
  ROLLBACK_WINDOW,
  type MatchSetup,
  type Packet,
  type Transport,
} from '@core/index';
import { createFakePair } from './fake-transport';
import { botScripts, runNetMatch } from './net-match';

const SETUP: MatchSetup = {
  simVersion: 1,
  seed: 3,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
};

function make(opts: { hashInterval?: number } = {}) {
  const inbox: Uint8Array[] = [];
  const sent: Uint8Array[] = [];
  const transport: Transport = { send: (b) => { sent.push(b); }, receive: () => inbox.shift() };
  const s = new LockstepSession({ world: createMatch(SETUP), side: 0, transport, ...opts });
  const inject = (p: Partial<Packet>): void => {
    inbox.push(encodePacket({ match: 0, flags: 0, ack: 0, firstTick: 0, inputs: [], hashes: [], ...p }));
  };
  return { s, inject, sent };
}

/** Warm up: peer sends honest inputs for ticks 0..9 and acks what we sent. */
function warm(opts: { hashInterval?: number } = {}) {
  const m = make(opts);
  m.inject({ ack: 0, firstTick: 0, inputs: Array.from({ length: 10 }, () => 0) });
  for (let i = 0; i < 6; i++) m.s.update(0);
  return m;
}

describe('LockstepSession batch checks', () => {
  it('slack is the contract packet size and exceeds the honest lead', () => {
    expect(BATCH_AHEAD_SLACK).toBe(MAX_INPUTS_PER_PACKET);
    expect(BATCH_AHEAD_SLACK).toBeGreaterThan(ROLLBACK_WINDOW + 8 + 1);
  });

  it('batch-ack: acking more than we sent desyncs and is not applied', () => {
    const { s, inject } = warm();
    const sent = s.stats.packetsSent;
    expect(sent).toBeGreaterThan(0);
    const before = s.captureSnapshot();
    inject({ ack: before.local.length + 1 });
    s.update(0);
    expect(s.status).toBe('desync');
    expect(s.desync?.check).toBe('batch-ack');
    expect(s.captureSnapshot().remoteAck).toBe(before.remoteAck);
  });

  it('batch-ack: acking exactly what was sent is fine', () => {
    const { s, inject } = warm();
    // After warm() everything we stamped has been sent, so local.length == sentUpTo is the largest honest ack.
    inject({ ack: s.captureSnapshot().local.length, firstTick: 10, inputs: [0] });
    s.update(0);
    expect(s.status).not.toBe('desync');
    expect(s.desync).toBeUndefined();
  });

  it('a bad packet after our own forfeit does not set desync', () => {
    const { s, inject } = warm();
    s.forfeit();
    inject({ ack: s.captureSnapshot().local.length + 1 });
    s.update(0);
    expect(s.desync).toBeUndefined();
    expect(s.status).toBe('forfeit');
  });

  it('a later hash mismatch keeps the batch-* check', () => {
    const { s, inject } = warm({ hashInterval: 1 });
    const t = s.checkpoints()[0];
    expect(t).toBeDefined();
    const [tick, h] = t as readonly [number, number];
    inject({ ack: s.captureSnapshot().local.length + 1 });
    s.update(0);
    expect(s.desync?.check).toBe('batch-ack');
    inject({ hashes: [{ tick, hash: h ^ 1 }] });
    s.update(0);
    expect(s.desync?.check).toBe('batch-ack');
    expect(s.desync?.tick).not.toBe(tick);
  });

  it('batch-first: a firstTick past what we acked desyncs, inputs not applied', () => {
    const { s, inject } = warm();
    const needed = s.captureSnapshot().remoteNeeded;
    inject({ firstTick: needed + 1, inputs: [0, 0, 0] });
    s.update(0);
    expect(s.status).toBe('desync');
    expect(s.desync?.check).toBe('batch-first');
    expect(s.captureSnapshot().remoteNeeded).toBe(needed);
  });

  it('batch-first: firstTick == remoteNeeded is fine', () => {
    const { s, inject } = warm();
    const needed = s.captureSnapshot().remoteNeeded;
    inject({ firstTick: needed, inputs: [0] });
    s.update(0);
    expect(s.status).not.toBe('desync');
  });

  it('batch-ahead: an end past local.length + slack desyncs, inputs not applied', () => {
    const { s, inject } = warm();
    const bk = s.captureSnapshot();
    const first = bk.remoteNeeded;
    const len = bk.local.length + BATCH_AHEAD_SLACK + 1 - first;
    inject({ firstTick: first, inputs: Array.from({ length: len }, () => 0) });
    s.update(0);
    expect(s.status).toBe('desync');
    expect(s.desync?.check).toBe('batch-ahead');
    expect(s.captureSnapshot().remoteNeeded).toBe(first);
  });

  it('batch-ahead: the exact limit does not desync', () => {
    const { s, inject } = warm();
    const bk = s.captureSnapshot();
    const first = bk.remoteNeeded;
    const len = bk.local.length + BATCH_AHEAD_SLACK - first;
    expect(len).toBeLessThanOrEqual(MAX_INPUTS_PER_PACKET);
    inject({ firstTick: first, inputs: Array.from({ length: len }, () => 0) });
    s.update(0);
    expect(s.status).not.toBe('desync');
  });

  it('honest play over loss, duplication and reorder never fires a batch check', () => {
    const limit = 400;
    const script = botScripts(SETUP, limit + 200);
    for (const seed of [11, 22, 33]) {
      for (const rollbackWindow of [0, ROLLBACK_WINDOW]) {
        const m = runNetMatch({
          setup: SETUP,
          script,
          tickLimit: limit,
          netSeed: seed,
          conditions: { latency: 2, jitter: 4, loss: 0.2, duplicate: 0.2, reorder: 0.2, reorderDelay: 12 },
          session: { rollbackWindow, inputDelay: 2 },
        });
        for (const s of m.sessions) {
          expect(s.desync).toBeUndefined();
          expect(s.status).toBe('ended');
        }
      }
    }
  });

  it('mixed per-side settings, a hidden tab, a catch-up burst and a cut link never fire a check', () => {
    const limit = 600;
    const script = botScripts(SETUP, limit + 200);
    for (const seed of [5, 6, 7]) {
      const worlds = [createMatch(SETUP), createMatch(SETUP)] as const;
      const net = createFakePair(seed, { latency: 2, jitter: 3, loss: 0.1, duplicate: 0.1, reorder: 0.1, reorderDelay: 9 });
      const a = new LockstepSession({ world: worlds[0], side: 0, transport: net.a, tickLimit: limit, rollbackWindow: ROLLBACK_WINDOW, inputDelay: 8, batchEvery: 8 });
      const b = new LockstepSession({ world: worlds[1], side: 1, transport: net.b, tickLimit: limit, rollbackWindow: 0, inputDelay: 0, batchEvery: 1 });
      const sessions = [a, b] as const;
      for (let wall = 1; wall < 1500; wall++) {
        net.advance();
        if (wall === 120) b.setHidden(true);
        if (wall === 200) b.setHidden(false);
        if (wall === 900) net.cut();
        for (const s of sessions) s.update(script[s.side][s.nextStampTick] ?? 0);
        for (const s of sessions) expect(s.desync).toBeUndefined();
      }
    }
  });

  it('after a batch-* desync we go silent (the peer times out in 5 s), even for forfeit and hidden', () => {
    const { s, inject, sent } = warm();
    inject({ ack: s.captureSnapshot().local.length + 1 });
    s.update(0);
    expect(s.desync?.check).toBe('batch-ack');
    const n = sent.length;
    for (let i = 0; i < 20; i++) s.update(0);
    s.setHidden(true);
    expect(sent.length).toBe(n);
    expect(s.stats.packetsSent).toBe(n);
  });

  it('a hash desync still keeps sending packets', () => {
    const { s, inject, sent } = warm({ hashInterval: 1 });
    const [tick, h] = s.checkpoints()[0] as readonly [number, number];
    inject({ hashes: [{ tick, hash: h ^ 1 }] });
    s.update(0);
    expect(s.desync?.check).toBe('hash');
    const n = sent.length;
    s.update(0);
    expect(sent.length).toBeGreaterThan(n);
  });
});
