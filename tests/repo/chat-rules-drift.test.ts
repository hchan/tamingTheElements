import { describe, expect, it } from 'vitest';
import * as client from '../../src/game/net/ws/chat-rules';
import * as core from '../../src/core/relay/chat-rules';

// The relay package and the game client each keep their own copy of the chat rules (the client may not import the package);
// this test fails if the constants or the validators differ. Rate-bucket helpers exist only in the relay copy.
const CONSTANTS = [
  'CHAT_TYPE', 'CHAT_MAX_BYTES', 'CHAT_FRAME_MAX', 'CHAT_RATE_PER_SEC', 'CHAT_BURST', 'CHAT_MAX_PER_SENDER', 'CHAT_CAP_BIT', 'CHAT_DETAIL_TAG',
  'CHAT_LIMIT_CODE', 'CHAT_UNDELIVERED_CODE', 'CHAT_REORDER_BACK', 'CHAT_SEEN_WORDS', 'CHAT_COST_MILLI', 'CHAT_CAP_MILLI',
] as const;

const agree = (b: number[] | Uint8Array): boolean => {
  const u = Uint8Array.from(b);
  return client.validateChatText(u, 0, u.length) === core.validateChatText(u, 0, u.length);
};

function* rng(seed: number): Generator<number> {
  let s = seed >>> 0;
  for (;;) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    yield s >>> 8;
  }
}

describe('chat rules: relay vs client copy', () => {
  it('every shared constant is equal, and the core module has no constant the client lacks', () => {
    for (const k of CONSTANTS) expect(client[k], k).toBe(core[k]);
    const coreNames = Object.entries(core).filter(([, v]) => typeof v === 'number').map(([k]) => k).sort();
    expect(coreNames).toEqual([...CONSTANTS].sort());
    expect(client.CHAT_CLIENT_BURST).toBeLessThan(core.CHAT_BURST);
  });

  it('validators agree on all 65,536 two-byte inputs and on every lead x second byte with a valid tail', () => {
    const bad: string[] = [];
    for (let a = 0; a < 256; a++) for (let b = 0; b < 256; b++) if (!agree([a, b])) bad.push(`${a.toString(16)} ${b.toString(16)}`);
    for (let a = 0xc0; a < 0x100; a++) for (let b = 0; b < 256; b++) for (const tail of [[], [0x80], [0x80, 0x80]]) if (!agree([a, b, ...tail, 0x61])) bad.push(`${a.toString(16)} ${b.toString(16)} ${String(tail.length)}`);
    expect(bad).toEqual([]);
  });

  it('validators agree on the boundaries, blanks, controls and empty input', () => {
    const cases: number[][] = [
      [0xe0, 0x80, 0x80], [0xe0, 0x9f, 0xbf], [0xe0, 0xa0, 0x80], [0xed, 0x9f, 0xbf], [0xed, 0xa0, 0x80], [0xf0, 0x80, 0x80, 0x80], [0xf0, 0x8f, 0xbf, 0xbf],
      [0xf0, 0x90, 0x80, 0x80], [0xf4, 0x8f, 0xbf, 0xbf], [0xf4, 0x90, 0x80, 0x80], [0xc0, 0x80], [0xc1, 0xbf], [0xc2, 0x80], [0xc2, 0xa0], [0x7f], [0x1f, 0x61],
      [0x61, 0x09], [0x20], [0xef, 0xbb, 0xbf], [0xef, 0xbb, 0xbf, 0x61], [0xe2, 0x80, 0x8b], [0xe2, 0x80, 0xa8, 0x61], [0xe3, 0x80, 0x80], [0xf0, 0x9f, 0x98, 0x80],
    ];
    for (const c of cases) expect(agree(c), c.map((x) => x.toString(16)).join(' ')).toBe(true);
    const u = Uint8Array.of(0x61, 0x62);
    for (const [s, e] of [[0, 0], [1, 1], [2, 1], [-1, 1], [0, 3], [1, 2]] as const) expect(client.validateChatText(u, s, e)).toBe(core.validateChatText(u, s, e));
  });

  it('validators agree on 20,000 seeded random strings', () => {
    const r = rng(0x5eed);
    const pool = [0x61, 0x20, 0x0a, 0x7f, 0xc2, 0xa0, 0x80, 0xe2, 0x80, 0x8b, 0xe3, 0x80, 0xf0, 0x9f, 0x98, 0xed, 0xa0, 0xf4, 0x90, 0xff, 0xef, 0xbb, 0xbf, 0xc3, 0xa9];
    for (let i = 0; i < 20_000; i++) {
      const n = 1 + (r.next().value as number) % 12;
      const b = Array.from({ length: n }, () => pool[(r.next().value as number) % pool.length] as number);
      expect(agree(b), b.map((x) => x.toString(16)).join(' ')).toBe(true);
    }
  });

  it('sanitizeOutgoing gives empty text or text the core validator accepts', () => {
    const r = rng(7);
    const pool = ['a', ' ', '\n', '\t', '\u0000', '\u007f', '\u0085', '‮', '⁦', '​', ' ', '﻿', '　', 'é', 'é', '\u{1F600}', '\ud800', 'x', ' '];
    for (let i = 0; i < 5000; i++) {
      const n = (r.next().value as number) % 10;
      const t = client.sanitizeOutgoing(Array.from({ length: n }, () => pool[(r.next().value as number) % pool.length] as string).join(''));
      if (t === '') continue;
      const b = new TextEncoder().encode(t);
      expect(core.validateChatText(b, 0, b.length), JSON.stringify(t)).toBe(true);
    }
    expect(client.sanitizeOutgoing('  hi\nthere‮ ')).toBe('hi there');
    expect(client.sanitizeOutgoing('é')).toBe('é');
    expect(client.sanitizeOutgoing(' \n​ ')).toBe('');
  });
});
