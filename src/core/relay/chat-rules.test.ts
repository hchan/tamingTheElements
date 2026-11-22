import { describe, expect, it } from 'vitest';
import {
  CHAT_BURST,
  CHAT_CAP_BIT,
  CHAT_DETAIL_TAG,
  CHAT_FRAME_MAX,
  CHAT_LIMIT_CODE,
  CHAT_MAX_BYTES,
  CHAT_MAX_PER_SENDER,
  CHAT_RATE_PER_SEC,
  CHAT_REORDER_BACK,
  CHAT_SEEN_WORDS,
  CHAT_TYPE,
  CHAT_UNDELIVERED_CODE,
  chatRefill,
  chatRetryAfterSec,
  validateChatText,
  type ChatBucket,
} from './chat-rules';
import { FrameType, MAX_INPUTS_PER_BATCH } from './constants';

const ok = (...b: number[]): boolean => validateChatText(Uint8Array.from(b), 0, b.length);
/** Hand-rolled UTF-8 encoder (tsconfig.core.json has no TextEncoder). */
const utf8 = (s: string): Uint8Array => {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
};
const okStr = (s: string): boolean => {
  const b = utf8(s);
  return validateChatText(b, 0, b.length);
};

describe('chat constants', () => {
  it('match the plan', () => {
    expect(CHAT_TYPE).toBe(0x70);
    expect(CHAT_TYPE).toBe(FrameType.chat);
    expect([CHAT_MAX_BYTES, CHAT_FRAME_MAX]).toEqual([120, 124]);
    expect([CHAT_RATE_PER_SEC, CHAT_BURST, CHAT_MAX_PER_SENDER]).toEqual([1, 3, 100]);
    expect([CHAT_CAP_BIT, CHAT_DETAIL_TAG]).toEqual([1, 0x70]);
    expect([CHAT_LIMIT_CODE, CHAT_UNDELIVERED_CODE]).toEqual([0x0d, 0x0e]);
    expect([CHAT_REORDER_BACK, CHAT_SEEN_WORDS]).toEqual([8, 8]);
    expect(CHAT_MAX_PER_SENDER).toBeLessThanOrEqual(256);
  });
  it('MAX_INPUTS_PER_BATCH fits the u8 serverHint', () => {
    expect(MAX_INPUTS_PER_BATCH).toBeLessThanOrEqual(255);
  });
});

describe('validateChatText', () => {
  it('accepts ascii, 2-, 3- and 4-byte text and emoji', () => {
    expect(okStr('hi')).toBe(true);
    expect(okStr('café')).toBe(true);
    expect(okStr('€5')).toBe(true);
    expect(okStr('\u{1F600} gg')).toBe(true);
    expect(okStr('\u{10FFFF}')).toBe(true);
  });
  it('honours start and end', () => {
    const b = Uint8Array.from([0xff, 0x68, 0x69, 0xff]);
    expect(validateChatText(b, 1, 3)).toBe(true);
    expect(validateChatText(b, 0, 4)).toBe(false);
  });
  it('accepts an exact 120-byte line', () => {
    const b = new Uint8Array(CHAT_MAX_BYTES).fill(0x61);
    expect(validateChatText(b, 0, b.length)).toBe(true);
  });
  it('rejects empty and all-blank text', () => {
    expect(ok()).toBe(false);
    expect(okStr('   ')).toBe(false);
    expect(okStr('  ᠎  ​‌‍')).toBe(false);
    expect(okStr('    ⁠　﻿')).toBe(false);
    expect(okStr(' x ')).toBe(true);
  });
  it('rejects overlongs', () => {
    expect(ok(0xc0, 0x80)).toBe(false);
    expect(ok(0xc1, 0xbf)).toBe(false);
    expect(ok(0xe0, 0x9f, 0xbf)).toBe(false);
    expect(ok(0xe0, 0xa0, 0x80)).toBe(true);
    expect(ok(0xf0, 0x8f, 0xbf, 0xbf)).toBe(false);
    expect(ok(0xf0, 0x90, 0x80, 0x80)).toBe(true);
  });
  it('rejects surrogates and above U+10FFFF', () => {
    expect(ok(0xed, 0xa0, 0x80)).toBe(false);
    expect(ok(0xed, 0xbf, 0xbf)).toBe(false);
    expect(ok(0xed, 0x9f, 0xbf)).toBe(true);
    expect(ok(0xf4, 0x90, 0x80, 0x80)).toBe(false);
    expect(ok(0xf4, 0x8f, 0xbf, 0xbf)).toBe(true);
    for (let b = 0xf5; b <= 0xff; b++) expect(ok(b, 0x80, 0x80, 0x80)).toBe(false);
  });
  it('rejects bad or missing continuation bytes', () => {
    expect(ok(0x80)).toBe(false);
    expect(ok(0xc2)).toBe(false);
    expect(ok(0xc2, 0x41)).toBe(false);
    expect(ok(0xe2, 0x82)).toBe(false);
    expect(ok(0xe2, 0x82, 0x41)).toBe(false);
    expect(ok(0xf0, 0x9f, 0x98)).toBe(false);
    expect(ok(0x41, 0xf0, 0x9f, 0x98, 0x41)).toBe(false);
  });
  it('rejects C0, DEL and C1 controls', () => {
    for (let c = 0; c < 0x20; c++) expect(ok(0x61, c)).toBe(false);
    expect(ok(0x61, 0x7f)).toBe(false);
    for (let c = 0x80; c <= 0x9f; c++) expect(ok(0x61, 0xc2, c)).toBe(false);
    expect(ok(0xc2, 0xa0, 0x61)).toBe(true); // NBSP beside text is fine
  });
});

describe('chat bucket', () => {
  const full: ChatBucket = { tokens: 3000, atMs: 0 };
  /** One send attempt: refill, then charge 1000 only when allowed (a refused line costs nothing). */
  const attempt = (b: ChatBucket, now: number): { b: ChatBucket; sent: boolean } => {
    const r = chatRefill(b, now);
    return r.tokens >= 1000 ? { b: { tokens: r.tokens - 1000, atMs: r.atMs }, sent: true } : { b: r, sent: false };
  };
  it('5 lines 50 ms apart: 3 sent, 2 refused with retryAfterSec 1', () => {
    let b = full;
    const out: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const a = attempt(b, i * 50);
      b = a.b;
      out.push(a.sent);
    }
    expect(out).toEqual([true, true, true, false, false]);
    expect(chatRetryAfterSec(b.tokens)).toBe(1);
  });
  it('refills to the cap after 3 s and never above', () => {
    const b = chatRefill({ tokens: 100, atMs: 100 }, 3100);
    expect(b).toEqual({ tokens: 3000, atMs: 3100 });
    expect(chatRefill(b, 1_000_000).tokens).toBe(3000);
  });
  it('a clock that goes backwards adds nothing', () => {
    expect(chatRefill({ tokens: 500, atMs: 1000 }, 900).tokens).toBe(500);
  });
  it('retryAfterSec is at least 1 and integer', () => {
    expect(chatRetryAfterSec(0)).toBe(1);
    expect(chatRetryAfterSec(999)).toBe(1);
  });
});
