import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeFrame, encodeFrame, FrameType, MAX_BATCH_BYTES, MAX_SETUP_BODY, type Frame } from './wire';
import { encodePacket, MAX_HASHES_PER_PACKET, MAX_INPUTS_PER_PACKET } from '@core/index';

const packet = (n: number, m: number): Uint8Array =>
  encodePacket({
    match: 3,
    flags: 1,
    ack: 9,
    firstTick: 100,
    inputs: Array.from({ length: n }, (_, i) => i),
    hashes: Array.from({ length: m }, (_, i) => ({ tick: 50 * i, hash: 0xdeadbeef })),
  });

const FRAMES: Frame[] = [
  { t: 'batch', seq: 0xffffffff, packet: packet(5, 2) },
  { t: 'setup', ctlSeq: 255, ackCtl: 7, body: new Uint8Array([1, 2, 3]) },
  { t: 'setup', ctlSeq: 0, ackCtl: 0xff, body: new Uint8Array(0) },
  { t: 'hash', seq: 4, matchId: 1, tick: 50, hash: 0xfeedface },
  { t: 'desync', seq: 5, matchId: 1, tick: 150, localHash: 1, remoteHash: 0xffffffff },
  { t: 'pause', seq: 6, matchId: 2, flags: 3 },
  { t: 'result', seq: 7, matchId: 2, winner: 1, reason: 3, ticks: 4500, finalHash: 0x80000000 },
  { t: 'ping', nonce: 9 },
  { t: 'pong', nonce: 0xabcdef01 },
  { t: 'error', code: 0x000b, retryAfterSec: 3600, detail: 0 },
];

describe('ws wire', () => {
  for (const f of FRAMES) {
    it(`round-trips ${f.t}`, () => {
      expect(decodeFrame(encodeFrame(f))).toEqual(f);
    });
  }

  it('uses the spec type bytes and sizes', () => {
    expect(encodeFrame({ t: 'hash', seq: 0, matchId: 0, tick: 0, hash: 0 })).toHaveLength(14);
    expect(encodeFrame({ t: 'desync', seq: 0, matchId: 0, tick: 0, localHash: 0, remoteHash: 0 })).toHaveLength(18);
    expect(encodeFrame({ t: 'pause', seq: 0, matchId: 0, flags: 0 })).toHaveLength(7);
    expect(encodeFrame({ t: 'result', seq: 0, matchId: 0, winner: 0, reason: 0, ticks: 0, finalHash: 0 })).toHaveLength(16);
    expect(encodeFrame({ t: 'error', code: 1, retryAfterSec: 0, detail: 0 })).toHaveLength(7);
    expect(encodeFrame({ t: 'ping', nonce: 1 })[0]).toBe(FrameType.ping);
    expect(MAX_BATCH_BYTES).toBe(305);
    expect(encodeFrame({ t: 'batch', seq: 1, packet: packet(MAX_INPUTS_PER_PACKET, MAX_HASHES_PER_PACKET) })).toHaveLength(305);
  });

  it('rejects malformed frames without throwing', () => {
    const batch = encodeFrame(FRAMES[0] as Frame);
    const bad: Uint8Array[] = [
      new Uint8Array(0),
      new Uint8Array([0x99]),
      new Uint8Array([FrameType.hash, 0, 0]),
      batch.subarray(0, batch.length - 1),
      new Uint8Array([...batch, 0]),
      new Uint8Array(MAX_BATCH_BYTES + 1).fill(FrameType.batch),
      encodeFrame({ t: 'ping', nonce: 1 }).subarray(0, 4),
      new Uint8Array([...encodeFrame({ t: 'pong', nonce: 1 }), 0]),
    ];
    // nInputs above the cap, with a body long enough to fool a length-only check
    const big = new Uint8Array(5 + 12 + 4 * 65 + 1);
    big[0] = FrameType.batch;
    big[5 + 10] = 65;
    bad.push(big);
    // nHashes above the cap
    const mh = new Uint8Array(5 + 12 + 8 * 5);
    mh[0] = FrameType.batch;
    mh[5 + 11] = 5;
    bad.push(mh);
    // SETUP: length field disagrees with the frame, and body over the cap
    const setup = encodeFrame({ t: 'setup', ctlSeq: 1, ackCtl: 0, body: new Uint8Array(4) });
    bad.push(setup.subarray(0, 10), new Uint8Array([...setup, 0]), setup.subarray(0, 8));
    const huge = new Uint8Array(9 + MAX_SETUP_BODY + 1);
    huge[0] = FrameType.setup;
    new DataView(huge.buffer).setUint16(7, MAX_SETUP_BODY + 1);
    bad.push(huge);
    for (const b of bad) expect(decodeFrame(b)).toBeUndefined();
  });

  it('truncates an oversize setup body on encode', () => {
    const f = decodeFrame(encodeFrame({ t: 'setup', ctlSeq: 0, ackCtl: 0, body: new Uint8Array(MAX_SETUP_BODY + 50) }));
    expect(f?.t === 'setup' && f.body.length).toBe(MAX_SETUP_BODY);
  });

  it('never throws on arbitrary bytes', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 300 }), (b) => { decodeFrame(b); }));
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), fc.constantFrom(...Object.values(FrameType)), (b, t) => {
        decodeFrame(new Uint8Array([t, ...b]));
      }),
    );
  });
});
