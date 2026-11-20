import { decodeText } from './text-codec';

/** Highest byte of 7-bit ASCII; a binary payload with a larger byte cannot be base64 text. */
export const ASCII_MAX = 0x7f;
/** `WebSocket.binaryType` the client asks for: binary messages then arrive as ArrayBuffer, decoded synchronously (a Blob would reorder frames). */
export const BINARY_TYPE = 'arraybuffer';

/**
 * The text of one inbound WebSocket message: a string as is, an ArrayBuffer or typed-array view read as 7-bit ASCII (a backend may send
 * the base64 text in a binary frame). `undefined` for non-ASCII bytes and for anything else (a Blob included: reading it is async and would reorder frames).
 */
export function inboundText(data: unknown): string | undefined {
  if (typeof data === 'string') return data;
  let bytes: Uint8Array;
  if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  else return undefined;
  let out = '';
  for (const b of bytes) {
    if (b > ASCII_MAX) return undefined;
    out += String.fromCharCode(b);
  }
  return out;
}

/** [choice] Longest notice text kept on the event; longer text is cut. */
export const NOTICE_TEXT_MAX = 120;
/** [choice] Longest message looked at as a possible notice; a bigger one is malformed (a gateway notice is a short line). */
export const NOTICE_SCAN_MAX = 512;
/** [contract] Printable 7-bit ASCII (space to tilde): what a notice may contain. Base64 has no space, so a space marks prose. */
const PRINTABLE = /^[\x20-\x7e]+$/;

/**
 * The text of an API-gateway failure notice ("Internal server error", "Too Many Requests", `{"message":"..."}`), or `undefined`.
 * Conservative: short printable ASCII only, and either a JSON object with a non-empty string `message`, or prose with a space
 * (base64 and a bare word such as "zz" never match, so a corrupt frame stays malformed). Text is cut to `NOTICE_TEXT_MAX`.
 */
export function gatewayNotice(data: unknown): string | undefined {
  const text = inboundText(data);
  if (text === undefined || text.length > NOTICE_SCAN_MAX || !PRINTABLE.test(text)) return undefined;
  let out: string | undefined;
  if (text.startsWith('{')) {
    try {
      const m = (JSON.parse(text) as { message?: unknown } | null)?.message;
      if (typeof m === 'string' && PRINTABLE.test(m)) out = m;
    } catch { /* not JSON */ }
  } else if (text.includes(' ')) out = text;
  return out?.slice(0, NOTICE_TEXT_MAX);
}

/** The API gateway sent a failure notice instead of a frame (not malformed; the match goes on). `text` is cut to `NOTICE_TEXT_MAX`. */
export interface GatewayNoticeEvent {
  readonly t: 'gateway-notice';
  readonly text: string;
}

/** `gatewayNotice` of one inbound message as an `OnlineEvent`, or `undefined`. */
export function gatewayEvent(data: unknown): GatewayNoticeEvent | undefined {
  const text = gatewayNotice(data);
  return text === undefined ? undefined : { t: 'gateway-notice', text };
}

/** Frame bytes of one inbound message (text or ASCII binary, base64 inside), `undefined` when malformed. */
export function inboundBytes(data: unknown): Uint8Array | undefined {
  const text = inboundText(data);
  return text === undefined ? undefined : decodeText(text);
}
