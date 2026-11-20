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

/** Frame bytes of one inbound message (text or ASCII binary, base64 inside), `undefined` when malformed. */
export function inboundBytes(data: unknown): Uint8Array | undefined {
  const text = inboundText(data);
  return text === undefined ? undefined : decodeText(text);
}
