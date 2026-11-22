/**
 * Chat rules shared by the relay and (mirrored in src/game/net/ws/chat-rules.ts) the client. Integer-only, no Date, no TextDecoder.
 * Wire layout: `0x70 | matchId u8 | chatSeq u8 | n u8 | n bytes UTF-8`.
 */

/** Frame type, both directions. */
export const CHAT_TYPE = 0x70;
/** Max UTF-8 bytes of one line, and the max frame (4-byte header + 120). */
export const CHAT_MAX_BYTES = 120;
export const CHAT_FRAME_MAX = 124;
/** Refill per second and burst size, in whole lines [estimate]. */
export const CHAT_RATE_PER_SEC = 1;
export const CHAT_BURST = 3;
/** Lines one sender may send per match [choice]; keeps the u8 chatSeq from wrapping. */
export const CHAT_MAX_PER_SENDER = 100;
/** Bit 0 of the WELCOME caps byte. */
export const CHAT_CAP_BIT = 1;
/** An ERROR detail of `(CHAT_DETAIL_TAG << 8) | chatSeq` belongs to one chat line and never closes the socket. */
export const CHAT_DETAIL_TAG = 0x70;
/** New error codes [choice, pending server-side agreement]. */
export const CHAT_LIMIT_CODE = 0x0d;
export const CHAT_UNDELIVERED_CODE = 0x0e;
/** Receiver order repair looks back at most this many lines; the seen-set is this many u32 words (256 bits). */
export const CHAT_REORDER_BACK = 8;
export const CHAT_SEEN_WORDS = 8;

/** Token bucket in milli-tokens (1000 = one line). */
export const CHAT_COST_MILLI = 1000;
export const CHAT_CAP_MILLI = CHAT_BURST * 1000;

export interface ChatBucket {
  readonly tokens: number;
  readonly atMs: number;
}

/** Adds `elapsedMs * rate` milli-tokens (capped) and moves the clock to `nowMs`. A clock going backwards adds nothing. */
export function chatRefill(b: ChatBucket, nowMs: number): ChatBucket {
  const elapsed = nowMs > b.atMs ? nowMs - b.atMs : 0;
  const t = b.tokens + elapsed * CHAT_RATE_PER_SEC;
  return { tokens: t > CHAT_CAP_MILLI ? CHAT_CAP_MILLI : t, atMs: nowMs > b.atMs ? nowMs : b.atMs };
}

/** Whole seconds to wait for one line: `max(1, ceil((1000 - tokens) / (rate * 1000)))`. */
export function chatRetryAfterSec(tokensMilli: number): number {
  const need = CHAT_COST_MILLI - tokensMilli;
  const per = CHAT_RATE_PER_SEC * 1000;
  const s = need > 0 ? Math.floor((need + per - 1) / per) : 0;
  return s < 1 ? 1 : s;
}

/** True for code points that render as nothing: U+0020, 00A0, 1680, 180E, 2000-200D, 2028, 2029, 202F, 205F, 2060, 3000, FEFF. */
function isBlank(cp: number): boolean {
  return (
    cp === 0x20 ||
    cp === 0xa0 ||
    cp === 0x1680 ||
    cp === 0x180e ||
    (cp >= 0x2000 && cp <= 0x200d) ||
    cp === 0x2028 ||
    cp === 0x2029 ||
    cp === 0x202f ||
    cp === 0x205f ||
    cp === 0x2060 ||
    cp === 0x3000 ||
    cp === 0xfeff
  );
}

/**
 * Strict UTF-8 check of `bytes[start..end)`. Rejects overlongs, surrogates, code points above U+10FFFF, bad or missing
 * continuation bytes, C0 controls, DEL, C1 controls, and empty or all-blank text.
 */
export function validateChatText(bytes: Uint8Array, start: number, end: number): boolean {
  if (start < 0 || end > bytes.length || end <= start) return false;
  let visible = false;
  let i = start;
  while (i < end) {
    const b = bytes[i] as number;
    let cp: number;
    let len: number;
    if (b < 0x80) {
      cp = b;
      len = 1;
    } else if (b >= 0xc2 && b <= 0xdf) {
      len = 2;
      cp = b & 0x1f;
    } else if (b >= 0xe0 && b <= 0xef) {
      len = 3;
      cp = b & 0x0f;
    } else if (b >= 0xf0 && b <= 0xf4) {
      len = 4;
      cp = b & 0x07;
    } else return false; // 80-C1 (stray continuation, overlong lead) and F5-FF
    if (i + len > end) return false;
    for (let k = 1; k < len; k++) {
      const c = bytes[i + k] as number;
      if ((c & 0xc0) !== 0x80) return false;
      cp = (cp << 6) | (c & 0x3f);
    }
    if (len === 3 && (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff))) return false;
    if (len === 4 && (cp < 0x10000 || cp > 0x10ffff)) return false;
    if (cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f)) return false;
    if (!isBlank(cp)) visible = true;
    i += len;
  }
  return visible;
}
