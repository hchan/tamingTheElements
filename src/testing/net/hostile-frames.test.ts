import { describe, expect, it } from 'vitest';
import {
  characterId,
  createMatch,
  DEFAULT_SIM_FLAGS,
  encodePacket,
  hash,
  LockstepSession,
  type MatchSetup,
} from '@core/index';
import { seedSfc32 } from '../../core/rng/seed';
import type { Sfc32 } from '../../core/rng/sfc32';
import { WebSocketTransport } from '../../game/net/ws/transport';
import { encodeText } from '../../game/net/ws/text-codec';
import { encodeFrame } from '../../game/net/ws/wire';
import { FakeRelay } from './fake-relay';
import { botScripts, referenceHash } from './net-match';

const SETUP: MatchSetup = {
  simVersion: 1,
  seed: 0x5eed,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
};
const LIMIT = 500;
const SCRIPT = botScripts(SETUP, LIMIT + 200);

type Kind = 'badText' | 'wrongType' | 'binary' | 'truncated' | 'unknownT' | 'oversized' | 'randomBytes' | 'hugeSeq';
const KINDS: readonly Kind[] = ['badText', 'wrongType', 'binary', 'truncated', 'unknownT', 'oversized', 'randomBytes', 'hugeSeq'];

/** Kinds that can never decode to a frame, so each one must be counted as malformed. */
const ALWAYS_MALFORMED: ReadonlySet<Kind> = new Set(['badText', 'wrongType', 'binary', 'truncated', 'oversized']);

function bytesOf(rng: Sfc32, n: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = rng.int(256);
  return b;
}

/** One hostile inbound message (what a WebSocket 'message' event carries as data), from a seeded stream. */
function hostile(rng: Sfc32, kind: Kind): unknown {
  switch (kind) {
    case 'badText':
      return ['{"t":"batch","seq":', '%%%not base64%%%', '', '\u0000\u0001\ud800', 'null'][rng.int(5)];
    case 'wrongType':
      return [42, null, undefined, { t: 'batch' }, [1, 2, 3], true][rng.int(6)];
    case 'binary':
      return bytesOf(rng, 1 + rng.int(40)).buffer;
    case 'truncated':
      return encodeText(bytesOf(rng, 1).map((x) => 0x40 + (x % 4)));
    case 'unknownT':
      return encodeText(Uint8Array.of(0x70 + rng.int(0x10), ...bytesOf(rng, rng.int(12))));
    case 'oversized':
      return 'A'.repeat(100_000 + rng.int(1000));
    case 'randomBytes':
      return encodeText(bytesOf(rng, 1 + rng.int(60)));
    case 'hugeSeq':
      return encodeText(
        encodeFrame({ t: 'batch', seq: 0xfffffff0 + rng.int(16), packet: encodePacket({ match: 0, flags: 0, ack: 0, firstTick: rng.int(1 << 20), inputs: [1], hashes: [] }) }),
      );
  }
}

function playHostile(seed: number, everyMs: number) {
  const clock = { ms: 0 };
  const relay = new FakeRelay(clock, 11);
  const ws = [new WebSocketTransport(relay.a, () => clock.ms), new WebSocketTransport(relay.b, () => clock.ms)] as const;
  const worlds = [createMatch(SETUP), createMatch(SETUP)] as const;
  const sessions = [0, 1].map(
    (i) => new LockstepSession({ world: worlds[i as 0 | 1], side: i as 0 | 1, transport: ws[i as 0 | 1], tickLimit: LIMIT, adaptive: false, rollbackWindow: 6 }),
  ) as [LockstepSession, LockstepSession];
  const rng = seedSfc32(seed, 'hostile-frames');
  const sockets = [relay.a, relay.b] as const;
  const injected = { always: [0, 0], total: [0, 0] };
  let wall = 0;
  while (wall < LIMIT * 20 && !sessions.every((s) => s.status === 'ended')) {
    wall++;
    clock.ms += 20;
    if (wall % everyMs === 0) {
      const to = rng.int(2);
      const kind = KINDS[rng.int(KINDS.length)] as Kind;
      // Hostile frames are the only thing aimed at the transport here besides the relay's own traffic.
      expect(() => { sockets[to]?.deliver(hostile(rng, kind)); }).not.toThrow();
      injected.total[to] = (injected.total[to] ?? 0) + 1;
      if (ALWAYS_MALFORMED.has(kind)) injected.always[to] = (injected.always[to] ?? 0) + 1;
    }
    relay.advance();
    for (const s of sessions) expect(() => { s.update(SCRIPT[s.side][s.nextStampTick] ?? 0); }).not.toThrow();
  }
  return { sessions, worlds, ws, injected, wall };
}

describe('hostile inbound frames (seeded) against the WebSocket client path', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${String(seed)}: nothing throws, bad frames are counted, the match still ends with equal hashes`, () => {
      const r = playHostile(seed, 3);
      expect(r.sessions.map((s) => s.status)).toEqual(['ended', 'ended']);
      expect(r.sessions[0].desync).toBeUndefined();
      expect(r.sessions[1].desync).toBeUndefined();
      expect(hash(r.worlds[0].state)).toBe(hash(r.worlds[1].state));
      expect(hash(r.worlds[0].state)).toBe(referenceHash(SETUP, SCRIPT, LIMIT, 2));
      for (const i of [0, 1]) {
        expect(r.injected.total[i]).toBeGreaterThan(20);
        expect(r.ws[i as 0 | 1].malformed).toBeGreaterThanOrEqual(r.injected.always[i] ?? 0);
        expect(r.ws[i as 0 | 1].malformed).toBeLessThanOrEqual(r.injected.total[i] ?? 0);
      }
    });
  }

  it('a duplicate of a valid frame is accepted at most once', () => {
    const clock = { ms: 0 };
    const relay = new FakeRelay(clock, 1);
    const b = new WebSocketTransport(relay.b, () => clock.ms);
    const f = encodeText(encodeFrame({ t: 'batch', seq: 0, packet: encodePacket({ match: 0, flags: 0, ack: 0, firstTick: 0, inputs: [1], hashes: [] }) }));
    relay.b.deliver(f);
    relay.b.deliver(f);
    expect(b.receive()).toBeDefined();
    expect(b.receive()).toBeUndefined();
  });
});
