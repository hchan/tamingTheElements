import { CHAT_DETAIL_TAG, CHAT_FRAME_MAX, CHAT_MAX_BYTES, CHAT_TYPE } from './chat-rules';

/** CHAT frame (`0x70`, docs/ONLINE-PROTOCOL.md 4a): `matchId u8, chatSeq u8, n u8, n bytes`. Never throws. */
export interface ChatFrame {
  readonly match: number;
  readonly seq: number;
  readonly bytes: Uint8Array;
}

/** `undefined` when the text is empty or over 120 bytes. */
export function encodeChat(match: number, seq: number, bytes: Uint8Array): Uint8Array | undefined {
  if (bytes.length < 1 || bytes.length > CHAT_MAX_BYTES) return undefined;
  const out = new Uint8Array(4 + bytes.length);
  out[0] = CHAT_TYPE;
  out[1] = match & 0xff;
  out[2] = seq & 0xff;
  out[3] = bytes.length;
  out.set(bytes, 4);
  return out;
}

/** `undefined` unless the length is exactly `4 + n` with n in 1..120 (the text itself is checked by `validateChatText`). */
export function decodeChat(b: Uint8Array): ChatFrame | undefined {
  if (b[0] !== CHAT_TYPE || b.length < 5 || b.length > CHAT_FRAME_MAX) return undefined;
  const n = b[3] as number;
  if (n < 1 || n > CHAT_MAX_BYTES || b.length !== 4 + n) return undefined;
  return { match: b[1] as number, seq: b[2] as number, bytes: b.slice(4) };
}

/** The chatSeq a tagged ERROR `detail` names, or `undefined` for any other detail (that error is not about a chat line). */
export function chatErrorSeq(detail: number): number | undefined {
  return detail >>> 8 === CHAT_DETAIL_TAG ? detail & 0xff : undefined;
}
