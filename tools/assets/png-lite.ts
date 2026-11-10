// Minimal deterministic PNG codec for the sheet packer (8-bit RGB/RGBA, non-interlaced in; 8-bit RGBA, filter 0, zlib level 9 out).
// No dependencies; the output bytes depend only on the pixels, so packing is reproducible.
import { crc32, deflateSync, inflateSync } from 'node:zlib';

export interface Image {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  readonly data: Uint8Array;
}

const SIG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function decodePng(buf: Uint8Array): Image {
  if (buf.length < 8 || SIG.some((b, i) => buf[i] !== b)) throw new Error('not a PNG');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= buf.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(buf[pos + 4] ?? 0, buf[pos + 5] ?? 0, buf[pos + 6] ?? 0, buf[pos + 7] ?? 0);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = dv.getUint32(pos + 8);
      height = dv.getUint32(pos + 12);
      const color = body[9];
      if (body[8] !== 8 || (color !== 6 && color !== 2) || body[12] !== 0) throw new Error('unsupported PNG (need 8-bit RGB/RGBA, non-interlaced)');
      channels = color === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length !== (stride + 1) * height) throw new Error('bad PNG data length');
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)] ?? 0;
    if (f > 4) throw new Error(`bad PNG filter ${f}`);
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x] ?? 0;
      const a = x >= channels ? (px[y * stride + x - channels] ?? 0) : 0;
      const b = y > 0 ? (px[(y - 1) * stride + x] ?? 0) : 0;
      const c = x >= channels && y > 0 ? (px[(y - 1) * stride + x - channels] ?? 0) : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = (v + p) & 255;
    }
  }
  if (channels === 4) return { width, height, data: px };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = px[i * 3] ?? 0;
    data[i * 4 + 1] = px[i * 3 + 1] ?? 0;
    data[i * 4 + 2] = px[i * 3 + 2] ?? 0;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

export function encodePng(img: Image): Uint8Array {
  const stride = img.width * 4;
  const raw = new Uint8Array((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) raw.set(img.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, img.width);
  dv.setUint32(4, img.height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))]);
}
