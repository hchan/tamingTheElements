import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const PROV = 'tools/assets/roster24-art/install-large-provenance.json';
interface Entry { sha256: string; size: [number, number]; source_sha256: string; approval: { reviewer: string; verdict: string } }
const prov = JSON.parse(readFileSync(PROV, 'utf8')) as Record<string, Entry>;
const HEROES = ['vortigal', 'kindrel', 'nykra', 'ouroth', 'brazgor', 'umbrel', 'hyalia', 'quarrak', 'glimmaw', 'zephra', 'abyssor', 'durrok'];

/** Decode an 8-bit RGBA, non-interlaced PNG to its alpha plane (enough for the border check; no image dependency). */
function alphaPlane(png: Buffer): { w: number; h: number; a: Uint8Array } {
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  expect([png[24], png[25], png[28]], 'bit depth 8, colour type 6 (RGBA), not interlaced').toEqual([8, 6, 0]);
  const idat: Buffer[] = [];
  for (let o = 8; o < png.length; ) {
    const len = png.readUInt32BE(o);
    if (png.toString('latin1', o + 4, o + 8) === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i] ?? 0;
      const left = i >= 4 ? (px[y * stride + i - 4] ?? 0) : 0;
      const up = y > 0 ? (px[(y - 1) * stride + i] ?? 0) : 0;
      const ul = y > 0 && i >= 4 ? (px[(y - 1) * stride + i - 4] ?? 0) : 0;
      let v = x;
      if (f === 1) v += left;
      else if (f === 2) v += up;
      else if (f === 3) v += (left + up) >> 1;
      else if (f === 4) {
        const p = left + up - ul;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
        v += pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
      }
      px[y * stride + i] = v & 255;
    }
  }
  const a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] ?? 0;
  return { w, h, a };
}

describe('roster24 Large portraits (tools/assets/roster24-art/install-large.py)', () => {
  it('provenance covers exactly the 12 heroes, all art-director APPROVE', () => {
    expect(Object.keys(prov).sort()).toEqual([...HEROES].sort());
    for (const h of HEROES) expect([prov[h]?.approval.reviewer, prov[h]?.approval.verdict], h).toEqual(['art-director', 'APPROVE']);
  });

  for (const h of HEROES) {
    it(`${h}Large.png matches its provenance sha256, size, RGBA, and has no opaque border pixel`, () => {
      const bytes = readFileSync(`public/assets/img/map/${h}Large.png`);
      const e = prov[h];
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(e?.sha256);
      const { w, h: ht, a } = alphaPlane(bytes);
      expect([w, ht]).toEqual(e?.size);
      for (let x = 0; x < w; x++) expect([a[x], a[(ht - 1) * w + x]], `row edge x=${x}`).toEqual([0, 0]);
      for (let y = 0; y < ht; y++) expect([a[y * w], a[y * w + w - 1]], `col edge y=${y}`).toEqual([0, 0]);
    });
  }

  it('abyssor has no alpha below 8 and zephra keeps >= 6 px transparent margin', () => {
    const aby = alphaPlane(readFileSync('public/assets/img/map/abyssorLarge.png'));
    expect(aby.a.some((v) => v > 0 && v < 8)).toBe(false);
    const z = alphaPlane(readFileSync('public/assets/img/map/zephraLarge.png'));
    for (let y = 0; y < z.h; y++) for (let x = 0; x < z.w; x++) {
      if (x < 6 || y < 6 || x >= z.w - 6 || y >= z.h - 6) expect(z.a[y * z.w + x], `${x},${y}`).toBe(0);
    }
  });
});
