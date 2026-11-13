import { describe, expect, it } from 'vitest';
import { decodePacket, encodePacket, MAX_HASHES_PER_PACKET, MAX_INPUTS_PER_PACKET, PacketFlag, type Packet } from './packet';

const sample: Packet = {
  match: 7,
  flags: PacketFlag.paused | PacketFlag.forfeit,
  ack: 0x01020304,
  firstTick: 0xfffffffe,
  inputs: [0, 1, 0xffff, 0x0420],
  hashes: [
    { tick: 50, hash: 0xdeadbeef },
    { tick: 100, hash: 0 },
  ],
};

describe('packet wire format', () => {
  it('round-trips every field, including the unsigned extremes', () => {
    expect(decodePacket(encodePacket(sample))).toEqual(sample);
  });

  it('encodes to the documented size and big-endian layout', () => {
    const buf = encodePacket(sample);
    expect(buf.length).toBe(12 + 2 * 4 + 8 * 2);
    expect([...buf.slice(0, 10)]).toEqual([7, 3, 1, 2, 3, 4, 0xff, 0xff, 0xff, 0xfe]);
    expect(buf[10]).toBe(4);
  });

  it('an empty packet is the 12 byte header', () => {
    const empty: Packet = { match: 0, flags: 0, ack: 0, firstTick: 0, inputs: [], hashes: [] };
    expect(encodePacket(empty).length).toBe(12);
    expect(decodePacket(encodePacket(empty))).toEqual(empty);
  });

  it('truncates inputs and hashes beyond the caps instead of overflowing the count byte', () => {
    const inputs = Array.from({ length: MAX_INPUTS_PER_PACKET + 10 }, (_, i) => i);
    const hashes = Array.from({ length: MAX_HASHES_PER_PACKET + 3 }, (_, i) => ({ tick: i, hash: i }));
    const got = decodePacket(encodePacket({ ...sample, inputs, hashes }));
    expect(got?.inputs).toEqual(inputs.slice(0, MAX_INPUTS_PER_PACKET));
    expect(got?.hashes).toEqual(hashes.slice(0, MAX_HASHES_PER_PACKET));
  });

  it('decodes a view into a larger buffer by its own offset', () => {
    const body = encodePacket(sample);
    const padded = new Uint8Array(body.length + 5);
    padded.set(body, 3);
    expect(decodePacket(padded.subarray(3, 3 + body.length))).toEqual(sample);
  });

  it('never throws on malformed datagrams: it returns undefined', () => {
    const good = encodePacket(sample);
    expect(decodePacket(new Uint8Array(0))).toBeUndefined();
    expect(decodePacket(good.slice(0, 11))).toBeUndefined();
    expect(decodePacket(good.slice(0, good.length - 1))).toBeUndefined(); // hash block cut short
    expect(decodePacket(new Uint8Array([...good, 0]))).toBeUndefined(); // trailing byte
    const tooManyInputs = good.slice();
    tooManyInputs[10] = MAX_INPUTS_PER_PACKET + 1;
    expect(decodePacket(tooManyInputs)).toBeUndefined();
    const tooManyHashes = good.slice();
    tooManyHashes[10 + 1 + 2 * 4] = MAX_HASHES_PER_PACKET + 1;
    expect(decodePacket(tooManyHashes)).toBeUndefined();
  });

  it('survives arbitrary byte soup without throwing', () => {
    let x = 12345;
    for (let i = 0; i < 300; i++) {
      const buf = new Uint8Array(i % 90);
      for (let j = 0; j < buf.length; j++) {
        x = (Math.imul(x, 1103515245) + 12345) >>> 0;
        buf[j] = x >>> 24;
      }
      expect(() => decodePacket(buf)).not.toThrow();
    }
  });
});
