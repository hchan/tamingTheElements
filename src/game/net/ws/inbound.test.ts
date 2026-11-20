import { describe, expect, it } from 'vitest';
import { ASCII_MAX, inboundBytes, inboundText } from './inbound';
import { encodeText } from './text-codec';

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
const BYTES = Uint8Array.of(1, 2, 3, 250, 251);
const B64 = encodeText(BYTES);

describe('inbound message decoding', () => {
  it('a string passes through unchanged', () => {
    expect(inboundText(B64)).toBe(B64);
    expect(inboundBytes(B64)).toEqual(BYTES);
  });

  it('an ArrayBuffer and any view are read as ASCII text', () => {
    const raw = ascii(B64);
    expect(inboundText(raw.buffer)).toBe(B64);
    expect(inboundBytes(raw.buffer)).toEqual(BYTES);
    expect(inboundBytes(raw)).toEqual(BYTES);
    const padded = new Uint8Array(raw.length + 4);
    padded.set(raw, 2);
    expect(inboundBytes(new Uint8Array(padded.buffer, 2, raw.length))).toEqual(BYTES);
    expect(inboundBytes(new DataView(padded.buffer, 2, raw.length))).toEqual(BYTES);
  });

  it('a byte above ASCII_MAX is malformed', () => {
    expect(inboundText(Uint8Array.of(0x41, ASCII_MAX + 1))).toBeUndefined();
    expect(inboundBytes(Uint8Array.of(0xff, 0xfe, 0xfd, 0xfc))).toBeUndefined();
  });

  it('ASCII that is not base64 is malformed', () => {
    expect(inboundBytes(ascii('zz'))).toBeUndefined();
    expect(inboundBytes(ascii('Internal server error'))).toBeUndefined();
    expect(inboundBytes(new Uint8Array(0))).toEqual(new Uint8Array(0));
  });

  it('a Blob, null and other values are malformed, never thrown', () => {
    expect(inboundBytes(new Blob([B64]))).toBeUndefined();
    expect(inboundBytes(undefined)).toBeUndefined();
    expect(inboundBytes(null)).toBeUndefined();
    expect(inboundBytes(42)).toBeUndefined();
    expect(inboundBytes({})).toBeUndefined();
  });
});
