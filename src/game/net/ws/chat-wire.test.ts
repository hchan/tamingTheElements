import { describe, expect, it } from 'vitest';
import { chatErrorSeq, decodeChat, encodeChat } from './chat-wire';
import { encodeText } from './text-codec';

describe('chat-wire', () => {
  it('encodes the documented example and round-trips', () => {
    const f = encodeChat(7, 0, Uint8Array.of(0x68, 0x69));
    expect(f).toEqual(Uint8Array.of(0x70, 7, 0, 2, 0x68, 0x69));
    expect(encodeText(f as Uint8Array)).toBe('cAcAAmhp');
    expect(decodeChat(f as Uint8Array)).toEqual({ match: 7, seq: 0, bytes: Uint8Array.of(0x68, 0x69) });
  });

  it('refuses empty and oversize text, and wrong lengths on decode', () => {
    expect(encodeChat(1, 1, new Uint8Array(0))).toBeUndefined();
    expect(encodeChat(1, 1, new Uint8Array(121))).toBeUndefined();
    expect(encodeChat(1, 1, new Uint8Array(120))?.length).toBe(124);
    expect(decodeChat(Uint8Array.of(0x70, 1, 1, 0))).toBeUndefined();
    expect(decodeChat(Uint8Array.of(0x70, 1, 1, 2, 0x61))).toBeUndefined();
    expect(decodeChat(Uint8Array.of(0x70, 1, 1, 1, 0x61, 0x62))).toBeUndefined();
    expect(decodeChat(Uint8Array.of(0x71, 1, 1, 1, 0x61))).toBeUndefined();
    expect(decodeChat(new Uint8Array(125).fill(0x70))).toBeUndefined();
  });

  it('chatErrorSeq reads only details with the 0x70 high byte', () => {
    expect(chatErrorSeq(0x7005)).toBe(5);
    expect(chatErrorSeq(0x70ff)).toBe(255);
    expect(chatErrorSeq(0)).toBeUndefined();
    expect(chatErrorSeq(3)).toBeUndefined();
    expect(chatErrorSeq(0x7100)).toBeUndefined();
  });
});
