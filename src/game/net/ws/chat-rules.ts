/**
 * Client mirror of src/core/relay/chat-rules.ts (the game may not import the relay package; tests/repo/chat-rules-drift.test.ts fails if
 * the constants or the validator differ). Wire layout: `0x70 | matchId u8 | chatSeq u8 | n u8 | n bytes UTF-8` (docs/ONLINE-PROTOCOL.md 4a).
 */
export const CHAT_TYPE = 0x70;
export const CHAT_MAX_BYTES = 120;
export const CHAT_FRAME_MAX = 124;
export const CHAT_RATE_PER_SEC = 1;
export const CHAT_BURST = 3;
export const CHAT_MAX_PER_SENDER = 100;
export const CHAT_CAP_BIT = 1;
export const CHAT_DETAIL_TAG = 0x70;
export const CHAT_LIMIT_CODE = 0x0d;
export const CHAT_UNDELIVERED_CODE = 0x0e;
export const CHAT_REORDER_BACK = 8;
export const CHAT_SEEN_WORDS = 8;
export const CHAT_COST_MILLI = 1000;
export const CHAT_CAP_MILLI = CHAT_BURST * 1000;
/** [choice] One line under the relay's burst, so the client says "Wait" before the relay has to. */
export const CHAT_CLIENT_BURST = 2;

/** Code points that render as nothing (same set as the relay). */
export function isBlankCp(cp: number): boolean {
  return (
    cp === 0x20 || cp === 0xa0 || cp === 0x1680 || cp === 0x180e || (cp >= 0x2000 && cp <= 0x200d) || cp === 0x2028 || cp === 0x2029 ||
    cp === 0x202f || cp === 0x205f || cp === 0x2060 || cp === 0x3000 || cp === 0xfeff
  );
}

const isControl = (cp: number): boolean => cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f);
const isBidi = (cp: number): boolean => (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);

/** Strict UTF-8 (TextDecoder, fatal) plus the relay's code-point rules: no controls, not empty, not all blank. */
export function validateChatText(bytes: Uint8Array, start: number, end: number): boolean {
  if (start < 0 || end > bytes.length || end <= start) return false;
  let s: string;
  try {
    s = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(start, end));
  } catch {
    return false;
  }
  let visible = false;
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (isControl(cp)) return false;
    if (!isBlankCp(cp)) visible = true;
  }
  return visible;
}

/**
 * Send path: C0 controls and DEL become spaces, C1 and bidi controls are removed, NFC, then trim blanks. The result is empty (do not
 * send) or passes `validateChatText`. Nothing is cut to length; callers count bytes.
 */
export function sanitizeOutgoing(text: string): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x20 || cp === 0x7f) out += ' ';
    else if (!isControl(cp) && !isBidi(cp)) out += ch;
  }
  const cps = Array.from(out.normalize('NFC'));
  let a = 0;
  let b = cps.length;
  while (a < b && isBlankCp((cps[a] as string).codePointAt(0) as number)) a++;
  while (b > a && isBlankCp((cps[b - 1] as string).codePointAt(0) as number)) b--;
  return cps.slice(a, b).join('');
}
