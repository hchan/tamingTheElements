import { describe, expect, it } from 'vitest';
import { decodePacket, encodePacket, PacketFlag } from '../net/packet';
import { decodeFrame, encodeFrame, type Frame } from './codec';
import { ErrorCode, FrameType, MAX_SETUP_BYTES, MAX_SETUP_FRAME } from './constants';

const c2s: Frame[] = [
  { t: 'hello', ver: 1, simVersion: 7, resumeSession: 0xdeadbeef },
  { t: 'queueJoin', mode: 0 },
  { t: 'queueLeave' },
  { t: 'roomCreate' },
  { t: 'roomJoin', code: 'ABC234' },
  { t: 'setup', seq: 5, ctlSeq: 2, ackCtl: 1, blob: new Uint8Array([1, 2, 3]) },
  { t: 'hash', seq: 9, matchId: 3, tick: 1000, hash: 0xffffffff },
  { t: 'desync', seq: 10, matchId: 3, tick: 1000, localHash: 1, remoteHash: 2 },
  { t: 'pause', seq: 11, matchId: 3, flags: 1 },
  { t: 'result', seq: 12, matchId: 3, winner: 1, reason: 0, ticks: 4000, finalHash: 77 },
  { t: 'ping', nonce: 123456 },
];
const s2c: Frame[] = [
  { t: 'welcome', ver: 1, sessionId: 42, resumed: 1, serverHint: 64 },
  { t: 'queueState', waitingSec: 12 },
  { t: 'roomCreated', code: 'XYZ789', ttlSec: 600 },
  { t: 'roomPeer', event: 0 },
  {
    t: 'matchStart',
    matchId: 1,
    slot: 1,
    seed: 0xfedcba98,
    inputDelay: 2,
    simVersion: 7,
    batchEvery: 1,
  },
  { t: 'peerStatus', matchId: 1, event: 2, graceMs: 10000 },
  { t: 'resultAck', matchId: 1, status: 0 },
  { t: 'pong', nonce: 9 },
  { t: 'error', code: ErrorCode.resting, retryAfterSec: 30, detail: 0 },
];

describe('codec', () => {
  it('round-trips every c2s frame', () => {
    for (const f of c2s) {
      const d = decodeFrame(encodeFrame(f), 'c2s');
      expect(d.ok && d.frame).toEqual(f);
    }
  });
  it('round-trips every s2c frame', () => {
    for (const f of s2c) {
      const d = decodeFrame(encodeFrame(f), 's2c');
      expect(d.ok && d.frame).toEqual(f);
    }
  });
  it('rejects the wrong direction', () => {
    for (const f of c2s) {
      if (f.t === 'setup' || f.t === 'pause') continue; // relayed both ways
      expect(decodeFrame(encodeFrame(f), 's2c').ok).toBe(false);
    }
    for (const f of s2c) expect(decodeFrame(encodeFrame(f), 'c2s').ok).toBe(false);
  });
  it('carries a BATCH packet byte for byte (parity with net/packet)', () => {
    const p = {
      match: 4,
      flags: PacketFlag.paused,
      ack: 3,
      firstTick: 10,
      inputs: [1, 2, 3],
      hashes: [{ tick: 10, hash: 5 }],
    };
    const packet = encodePacket(p);
    const f: Frame = { t: 'batch', seq: 1, match: 4, packet };
    const d = decodeFrame(encodeFrame(f));
    expect(d.ok && d.frame.t === 'batch' ? decodePacket(d.frame.packet) : undefined).toEqual(p);
    expect(d.ok && d.frame).toEqual(f);
  });
  it('never throws on malformed input', () => {
    expect(decodeFrame(new Uint8Array(0))).toMatchObject({ ok: false, code: ErrorCode.badFrame });
    expect(decodeFrame(new Uint8Array([0x00]))).toMatchObject({ ok: false });
    expect(decodeFrame(new Uint8Array([FrameType.hello, 1]))).toMatchObject({ ok: false });
    const hello = encodeFrame(c2s[0] as Frame);
    expect(decodeFrame(new Uint8Array([...hello, 0]))).toMatchObject({ ok: false });
    expect(decodeFrame(new Uint8Array([FrameType.roomJoin, 65, 66]))).toMatchObject({ ok: false });
    // fuzz: every prefix and single-byte mutation decodes to a result
    for (const f of [...c2s, ...s2c]) {
      const b = encodeFrame(f);
      for (let n = 0; n < b.length; n++) expect(() => decodeFrame(b.subarray(0, n))).not.toThrow();
      for (let i = 0; i < b.length; i++) {
        const m = b.slice();
        m[i] = (m[i] as number) ^ 0xff;
        expect(() => decodeFrame(m)).not.toThrow();
      }
    }
  });
  it('bounds SETUP and oversize frames', () => {
    const max = encodeFrame({
      t: 'setup',
      seq: 0,
      ctlSeq: 0,
      ackCtl: 0,
      blob: new Uint8Array(MAX_SETUP_BYTES),
    });
    expect(max.length).toBe(MAX_SETUP_FRAME);
    expect(decodeFrame(max).ok).toBe(true);
    expect(() =>
      encodeFrame({
        t: 'setup',
        seq: 0,
        ctlSeq: 0,
        ackCtl: 0,
        blob: new Uint8Array(MAX_SETUP_BYTES + 1),
      }),
    ).toThrow(RangeError);
    const big = new Uint8Array(MAX_SETUP_FRAME + 1);
    big[0] = FrameType.setup;
    expect(decodeFrame(big)).toMatchObject({ ok: false, code: ErrorCode.tooBig });
    const lie = max.slice();
    lie[8] = 0xff;
    lie[9] = 0xff;
    expect(decodeFrame(lie).ok).toBe(false);
  });
  it('uppercases room codes and rejects bad characters', () => {
    const f = encodeFrame({ t: 'roomJoin', code: 'abc234' });
    const d = decodeFrame(f);
    expect(d.ok && d.frame).toEqual({ t: 'roomJoin', code: 'ABC234' });
    const bad = f.slice();
    bad[2] = 0x07;
    expect(decodeFrame(bad).ok).toBe(false);
    expect(() => encodeFrame({ t: 'roomJoin', code: 'AB' })).toThrow(RangeError);
  });
});
