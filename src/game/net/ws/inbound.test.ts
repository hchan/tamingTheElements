import { describe, expect, it } from 'vitest';
import { ASCII_MAX, gatewayNotice, inboundBytes, inboundText, NOTICE_SCAN_MAX, NOTICE_TEXT_MAX } from './inbound';
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

describe('gateway notice classifier', () => {
  const json = (o: unknown): string => JSON.stringify(o);
  const long = `a ${'b'.repeat(NOTICE_TEXT_MAX * 2)}`;

  it('plain printable text with a space is a notice; JSON with a message string gives the message', () => {
    expect(gatewayNotice('Internal server error')).toBe('Internal server error');
    expect(gatewayNotice(json({ message: 'Too Many Requests', requestId: 'r0' }))).toBe('Too Many Requests');
    expect(gatewayNotice(ascii('Internal server error').buffer)).toBe('Internal server error');
  });

  it('a notice longer than NOTICE_TEXT_MAX is cut', () => {
    expect(gatewayNotice(long)).toHaveLength(NOTICE_TEXT_MAX);
    expect(gatewayNotice(json({ message: long }))).toHaveLength(NOTICE_TEXT_MAX);
  });

  it('frames, base64-like text, bare words, odd JSON, control characters, huge text and non-text are not notices', () => {
    expect(gatewayNotice(B64)).toBeUndefined();
    expect(gatewayNotice('zz')).toBeUndefined();
    expect(gatewayNotice('')).toBeUndefined();
    expect(gatewayNotice(json({ other: 'x' }))).toBeUndefined();
    expect(gatewayNotice(json({ message: 5 }))).toBeUndefined();
    expect(gatewayNotice(json({ message: '' }))).toBeUndefined();
    expect(gatewayNotice(json(['message']))).toBeUndefined();
    expect(gatewayNotice('{not json')).toBeUndefined();
    expect(gatewayNotice('two words\u0007')).toBeUndefined();
    expect(gatewayNotice(`a ${'b'.repeat(NOTICE_SCAN_MAX)}`)).toBeUndefined();
    expect(gatewayNotice(Uint8Array.of(0xff, 0x20, 0x41))).toBeUndefined();
    expect(gatewayNotice(new Blob(['a b']))).toBeUndefined();
    expect(gatewayNotice(null)).toBeUndefined();
  });
});
