/**
 * A small QR code encoder (docs/WEBRTC-PLAN.md WP 03): byte mode only, error levels L and M, versions 1-14 (up to 458 bytes at L),
 * the best of the 8 masks by the standard penalty score. Own code, no dependency; `qr.test.ts` checks it against the spec's
 * structure (finder/timing patterns, format and version words, Reed-Solomon remainders) and a known matrix.
 * `qrMatrix` returns undefined when the text does not fit, so the caller can say so in words instead of drawing nothing.
 */

export type QrLevel = 'L' | 'M';
export type QrMatrix = readonly (readonly boolean[])[];

/** Per version 1-14: [ec codewords per block, blocks in group 1, data codewords per group-1 block, blocks in group 2 (0 = none)]. Group 2 blocks hold one more data codeword. */
const BLOCKS: Readonly<Record<QrLevel, readonly (readonly [number, number, number, number])[]>> = {
  L: [[7, 1, 19, 0], [10, 1, 34, 0], [15, 1, 55, 0], [20, 1, 80, 0], [26, 1, 108, 0], [18, 2, 68, 0], [20, 2, 78, 0], [24, 2, 97, 0], [30, 2, 116, 0], [18, 2, 68, 2], [20, 4, 81, 0], [24, 2, 92, 2], [26, 4, 107, 0], [30, 3, 115, 1]],
  M: [[10, 1, 16, 0], [16, 1, 28, 0], [26, 1, 44, 0], [18, 2, 32, 0], [24, 2, 43, 0], [16, 4, 27, 0], [18, 4, 31, 0], [22, 2, 38, 2], [22, 3, 36, 2], [26, 4, 43, 1], [30, 1, 50, 4], [22, 6, 36, 2], [22, 8, 37, 1], [24, 4, 40, 5]],
};
const ALIGN: readonly (readonly number[])[] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66]];
export const MAX_VERSION = 14;

// GF(256) with the QR polynomial 0x11d.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] ?? 0;

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : (EXP[(LOG[a] ?? 0) + (LOG[b] ?? 0)] ?? 0);
}

/** Reed-Solomon remainder of `data` for `n` error-correction codewords. */
export function rsRemainder(data: readonly number[], n: number): number[] {
  // Generator (x - a^0)...(x - a^(n-1)), highest degree first, leading 1 implied.
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    gen.forEach((c, j) => {
      next[j] = (next[j] ?? 0) ^ c;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(c, EXP[i] ?? 0);
    });
    gen = next;
  }
  const rem = new Array<number>(n).fill(0);
  for (const d of data) {
    const factor = d ^ (rem.shift() ?? 0);
    rem.push(0);
    for (let j = 0; j < n; j++) rem[j] = (rem[j] ?? 0) ^ gfMul(gen[j + 1] ?? 0, factor);
  }
  return rem;
}

function dataCapacity(level: QrLevel, version: number): number {
  const [, b1, d1, b2] = BLOCKS[level][version - 1] ?? [0, 0, 0, 0];
  return b1 * d1 + b2 * (d1 + 1);
}

/** Smallest version holding `bytes` at `level`, or undefined. */
export function pickVersion(bytes: number, level: QrLevel): number | undefined {
  for (let v = 1; v <= MAX_VERSION; v++) {
    const header = 4 + (v >= 10 ? 16 : 8);
    if (Math.ceil((header + bytes * 8) / 8) <= dataCapacity(level, v)) return v;
  }
  return undefined;
}

function codewords(bytes: readonly number[], level: QrLevel, version: number): number[] {
  const bits: number[] = [];
  const put = (value: number, n: number): void => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version >= 10 ? 16 : 8);
  for (const b of bytes) put(b, 8);
  const cap = dataCapacity(level, version) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < cap / 8; pad ^= 0xec ^ 0x11) data.push(pad);

  const [ec, b1, d1, b2] = BLOCKS[level][version - 1] ?? [0, 0, 0, 0];
  const blocks: number[][] = [];
  let at = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const len = i < b1 ? d1 : d1 + 1;
    blocks.push(data.slice(at, at + len));
    at += len;
  }
  const ecs = blocks.map((b) => rsRemainder(b, ec));
  const out: number[] = [];
  const longest = d1 + (b2 > 0 ? 1 : 0);
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out.push(b[i] ?? 0);
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i] ?? 0);
  return out;
}

/** Remainder of `value * x^(polyBits-1)` divided by the generator `poly` (polyBits bits wide). */
function bch(value: number, poly: number, polyBits: number): number {
  let v = value << (polyBits - 1);
  while (v !== 0 && 32 - Math.clz32(v) >= polyBits) v ^= poly << (32 - Math.clz32(v) - polyBits);
  return v;
}

/** The 15-bit format word (level bits L=01, M=00, then the mask 0-7), after the 0x5412 xor. */
export function formatBits(level: QrLevel, mask: number): number {
  const data = ((level === 'L' ? 1 : 0) << 3) | mask;
  return (((data << 10) | bch(data, 0x537, 11)) ^ 0x5412) >>> 0;
}

/** The 18-bit version word (versions 7 and up). */
export function versionBits(version: number): number {
  return (version << 12) | bch(version, 0x1f25, 13);
}

const MASKS: readonly ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function penalty(m: readonly (readonly boolean[])[]): number {
  const n = m.length;
  const at = (r: number, c: number): boolean => m[r]?.[c] ?? false;
  let p = 0;
  for (const rows of [true, false]) {
    for (let a = 0; a < n; a++) {
      const w = (b: number): boolean => (rows ? at(a, b) : at(b, a));
      let run = 1;
      for (let b = 1; b < n; b++) {
        if (w(b) === w(b - 1)) {
          run++;
          if (run === 5) p += 3;
          else if (run > 5) p++;
        } else run = 1;
      }
      // Finder-like 1:1:3:1:1 with four light modules on one side.
      for (let b = 0; b + 10 < n; b++) {
        if (w(b) && !w(b + 1) && w(b + 2) && w(b + 3) && w(b + 4) && !w(b + 5) && w(b + 6) && !w(b + 7) && !w(b + 8) && !w(b + 9) && !w(b + 10)) p += 40;
        if (!w(b) && !w(b + 1) && !w(b + 2) && !w(b + 3) && w(b + 4) && !w(b + 5) && w(b + 6) && w(b + 7) && w(b + 8) && !w(b + 9) && w(b + 10)) p += 40;
      }
    }
  }
  let dark = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (at(r, c)) dark++;
      if (r + 1 < n && c + 1 < n && at(r, c) === at(r, c + 1) && at(r, c) === at(r + 1, c) && at(r, c) === at(r + 1, c + 1)) p += 3;
    }
  }
  return p + Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
}

/** The module matrix (true = dark) of `text` as UTF-8 bytes, or undefined if it exceeds version 14 at `level`. `forceMask` pins the mask (tests). */
export function qrMatrix(text: string, level: QrLevel = 'L', forceMask?: number): QrMatrix | undefined {
  const bytes = [...new TextEncoder().encode(text)];
  const version = pickVersion(bytes.length, level);
  if (version === undefined) return undefined;
  const n = 17 + 4 * version;
  const base: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const fixed: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const put = (m: boolean[][], r: number, c: number, dark: boolean, lock: boolean): void => {
    const row = m[r];
    if (row === undefined || c < 0 || c >= n) return;
    row[c] = dark;
    if (lock) {
      const f = fixed[r];
      if (f) f[c] = true;
    }
  };
  const set = (r: number, c: number, dark: boolean): void => {
    put(base, r, c, dark, true);
  };
  const finder = (r0: number, c0: number): void => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        set(r0 + r, c0 + c, inside && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)));
      }
    }
  };
  finder(0, 0);
  finder(0, n - 7);
  finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const al = ALIGN[version - 1] ?? [];
  const last = al[al.length - 1];
  for (const r of al) {
    for (const c of al) {
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (c === 6 && r === last)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
  const writeFormat = (m: boolean[][], mask: number, lock: boolean): void => {
    const f = formatBits(level, mask);
    for (let i = 0; i < 15; i++) {
      const dark = ((f >>> i) & 1) === 1;
      if (i < 6) put(m, i, 8, dark, lock);
      else if (i < 8) put(m, i + 1, 8, dark, lock);
      else if (i === 8) put(m, 8, 7, dark, lock);
      else put(m, 8, 14 - i, dark, lock);
      if (i < 8) put(m, 8, n - 1 - i, dark, lock);
      else put(m, n - 15 + i, 8, dark, lock);
    }
    put(m, n - 8, 8, true, lock); // the always-dark module
  };
  writeFormat(base, 0, true);
  if (version >= 7) {
    const v = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((v >>> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + n - 11;
      set(a, b, dark);
      set(b, a, dark);
    }
  }
  // Data placement: zig-zag in column pairs from the bottom right, skipping the timing column 6.
  const bits: boolean[] = [];
  for (const b of codewords(bytes, level, version)) for (let i = 7; i >= 0; i--) bits.push(((b >>> i) & 1) === 1);
  const cells: [number, number][] = [];
  let up = true;
  for (let c = n - 1; c > 0; c -= 2) {
    if (c === 6) c--;
    for (let k = 0; k < n; k++) {
      const r = up ? n - 1 - k : k;
      for (const cc of [c, c - 1]) if (!fixed[r]?.[cc]) cells.push([r, cc]);
    }
    up = !up;
  }
  let best: boolean[][] = base;
  let bestScore = Infinity;
  for (let mask = forceMask ?? 0; mask < (forceMask === undefined ? 8 : forceMask + 1); mask++) {
    const m = base.map((row) => row.slice());
    const fn = MASKS[mask] ?? MASKS[0];
    cells.forEach(([r, c], i) => {
      put(m, r, c, (bits[i] ?? false) !== (fn?.(r, c) ?? false), false);
    });
    writeFormat(m, mask, false);
    const score = penalty(m);
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** An SVG of the matrix with a 4-module quiet zone, as markup safe to inject (numbers only). */
export function qrSvg(m: QrMatrix, scale = 4): string {
  const n = m.length + 8;
  let d = '';
  m.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      let e = c;
      while (e < row.length && row[e]) e++;
      d += `M${String(c + 4)} ${String(r + 4)}h${String(e - c)}v1h${String(c - e)}z`;
      c = e;
    }
  });
  const px = String(n * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(n)} ${String(n)}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${String(n)}" height="${String(n)}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
