/**
 * Base64 text codec for WebSocket frames (docs/RELAY-PACKAGE.md, v3 wire): standard alphabet, `=` padding, no line breaks (RFC 4648
 * section 4). Hand-written over Uint8Array so it runs unchanged in Node, browsers and Workers (no Buffer, btoa or atob).
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const REVERSE = ((): Int8Array => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < 64; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

/** Bytes to base64 text. */
export function encodeText(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >> 18) & 63] as string;
    out += ALPHABET[(n >> 12) & 63] as string;
    out += b === undefined ? '=' : (ALPHABET[(n >> 6) & 63] as string);
    out += c === undefined ? '=' : (ALPHABET[n & 63] as string);
  }
  return out;
}

/** Base64 text to bytes; `undefined` for anything that is not canonical-length standard base64 (other alphabet, bad padding, whitespace). */
export function decodeText(text: string): Uint8Array | undefined {
  const len = text.length;
  if (len % 4 !== 0) return undefined;
  const pad = len === 0 ? 0 : text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((len / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const last = i + 4 === len;
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const ch = text.charCodeAt(i + k);
      let v: number;
      if (ch === 61) {
        if (!last || k < 4 - pad) return undefined;
        v = 0;
      } else {
        v = ch < 128 ? (REVERSE[ch] as number) : -1;
        if (v < 0) return undefined;
      }
      n = (n << 6) | v;
    }
    out[o++] = (n >> 16) & 255;
    if (!last || pad < 2) out[o++] = (n >> 8) & 255;
    if (!last || pad < 1) out[o++] = n & 255;
  }
  return out;
}
