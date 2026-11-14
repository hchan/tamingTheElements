import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng, type Image } from '../../tools/assets/png-lite';
import { ACTIONS, DIRS, framesIn, HERO_FRAME, resolveRow, type SheetsManifest } from '../../src/game/assets/sheet-spec';
import { SHEETS_MANIFEST_PATH } from '../../tools/assets/pack-sheets';
import { drawnBox, fitToBox, frameBox, setFrameBox, type BoxedImage } from '../../src/game/views/hero-scale';

// QA metrics for the portrait rigs (ADR-0020, tools/assets/portrait-rig): every baked frame of Pax, Sindarosa and Curomo,
// checked against the numbers in the plan (coverage, margin, steady feet, no halo, facing, painted detail kept).

const root = resolve(import.meta.dirname, '../..');
const HEROES = ['pax', 'sindarosa', 'curomo'] as const;
const BAKED = ['E', 'SE', 'S', 'N', 'NE'] as const;
const frameFile = (hero: string, action: string, dir: string, i: number): string =>
  resolve(root, 'imgWorkArea/sheets', hero, action, dir, `${String(i).padStart(2, '0')}.png`);
const load = (p: string): Image => decodePng(new Uint8Array(readFileSync(p)));
const alpha = (img: Image, x: number, y: number): number => img.data[(y * img.width + x) * 4 + 3] ?? 0;
const luma = (img: Image, x: number, y: number): number => {
  const k = (y * img.width + x) * 4;
  return (img.data[k] ?? 0) * 0.3 + (img.data[k + 1] ?? 0) * 0.59 + (img.data[k + 2] ?? 0) * 0.11;
};

/** Opaque bounding box (alpha >= `min`) of columns [cx0, cx1): [x0, y0, x1, y1] inclusive, or undefined when empty. */
function bbox(img: Image, min = 1, cx0 = 0, cx1 = img.width): [number, number, number, number] | undefined {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = Math.max(0, cx0); x < Math.min(img.width, cx1); x++)
      if (alpha(img, x, y) >= min) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return x1 < 0 ? undefined : [x0, y0, x1, y1];
}

/**
 * Share of soft edge pixels (0 < a < 255, touching the opaque body) whose luma lies outside [min - 40, max + 40] of the opaque
 * pixels within 2 px: a colour the body next to it does not have (matte residue, a dark or light fringe from sampling
 * unbled background). The plan's first draft compared against the single nearest opaque pixel, but the painted portraits
 * have ink and highlights right on their silhouettes: that metric scores the portraits themselves 25-37% at body size,
 * so it cannot tell a pipeline halo from the painting. On this metric the portraits score 14-23% at body size (area
 * downscale mixes ink into edge pixels); the bake, which bleeds colour before resampling, stays under 4%.
 */
function haloShare(img: Image): number {
  let edge = 0;
  let bad = 0;
  for (let y = 2; y < img.height - 2; y++)
    for (let x = 2; x < img.width - 2; x++) {
      const a = alpha(img, x, y);
      if (a === 0 || a === 255) continue;
      let touches = false;
      let lo = Infinity;
      let hi = -Infinity;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          if (alpha(img, x + dx, y + dy) !== 255) continue;
          if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) touches = true;
          const l = luma(img, x + dx, y + dy);
          lo = Math.min(lo, l);
          hi = Math.max(hi, l);
        }
      if (!touches) continue; // shadow and glow falloff: no opaque body next to it
      edge++;
      const l = luma(img, x, y);
      if (l < lo - 40 || l > hi + 40) bad++;
    }
  // fading frames (tagIn) have almost no fully opaque body, so a handful of edge pixels says nothing
  return edge < 200 ? 0 : bad / edge;
}

/** Variance of the 4-neighbour Laplacian of luma over interior opaque pixels (a blur score: lower is softer). */
function laplacianVar(img: Image): number {
  const v: number[] = [];
  for (let y = 1; y < img.height - 1; y++)
    for (let x = 1; x < img.width - 1; x++) {
      if ([alpha(img, x, y), alpha(img, x - 1, y), alpha(img, x + 1, y), alpha(img, x, y - 1), alpha(img, x, y + 1)].some((a) => a < 255)) continue;
      v.push(luma(img, x - 1, y) + luma(img, x + 1, y) + luma(img, x, y - 1) + luma(img, x, y + 1) - 4 * luma(img, x, y));
    }
  const m = v.reduce((s, n) => s + n, 0) / Math.max(1, v.length);
  return v.reduce((s, n) => s + (n - m) ** 2, 0) / Math.max(1, v.length);
}

/** Premultiplied area downscale by `s` (0 < s <= 1), so the portrait can be compared at the baked body size. */
function areaScale(img: Image, s: number): Image {
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const acc = new Float64Array(w * h * 4);
  const cover = new Float64Array(w * h);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const k = (y * img.width + x) * 4;
      const a = img.data[k + 3] ?? 0;
      const o = Math.min(h - 1, Math.floor(y * s)) * w + Math.min(w - 1, Math.floor(x * s));
      acc[o * 4] = (acc[o * 4] ?? 0) + (img.data[k] ?? 0) * a;
      acc[o * 4 + 1] = (acc[o * 4 + 1] ?? 0) + (img.data[k + 1] ?? 0) * a;
      acc[o * 4 + 2] = (acc[o * 4 + 2] ?? 0) + (img.data[k + 2] ?? 0) * a;
      acc[o * 4 + 3] = (acc[o * 4 + 3] ?? 0) + a;
      cover[o] = (cover[o] ?? 0) + 1;
    }
  const data = new Uint8Array(w * h * 4);
  for (let o = 0; o < w * h; o++) {
    const A = acc[o * 4 + 3] ?? 0;
    const n = cover[o] ?? 1;
    if (A > 0) for (let c = 0; c < 3; c++) data[o * 4 + c] = Math.round((acc[o * 4 + c] ?? 0) / A);
    data[o * 4 + 3] = Math.round(A / n);
  }
  return { width: w, height: h, data };
}

describe('portrait rigs (ADR-0020): baked frame QA', () => {
  const manifest = JSON.parse(readFileSync(SHEETS_MANIFEST_PATH, 'utf8')) as SheetsManifest;

  it.each(HEROES)('%s: every action in every baked direction, 240 px frames, a box, and all 8 directions resolve', (hero) => {
    for (const [action] of ACTIONS)
      for (const dir of BAKED)
        for (let i = 0; i < framesIn(action); i++) {
          const f = frameFile(hero, action, dir, i);
          expect(existsSync(f), f).toBe(true);
          const img = load(f);
          expect([img.width, img.height]).toEqual([HERO_FRAME, HERO_FRAME]);
        }
    const entry = manifest.sheets.find((s) => s.sprite === hero);
    expect(entry?.frame).toBe(HERO_FRAME);
    expect(entry?.box).toEqual([20, 24, 200, 200]);
    for (const [action] of ACTIONS)
      for (const dir of DIRS) {
        const r = resolveRow(manifest, hero, action, dir);
        expect(r.source, `${action}/${dir}`).not.toBe('legacy');
        if (dir === 'N' || dir === 'S') expect(r.source).toBe('own');
      }
  });

  it.each(HEROES)('%s: no clipping (2 px margin), steady feet in idle and walk, no halo', (hero) => {
    // the feet: columns within 40 px of the body's ground pivot (wing and tail tips that hang lower are free to move)
    const rig = JSON.parse(readFileSync(resolve(root, 'imgWorkArea/rigs', hero, 'rig.json'), 'utf8')) as { res: number; parts: { id: string; at: [number, number] }[] };
    const footX = Math.round((rig.parts.find((p) => p.id === 'body')?.at[0] ?? 0) / rig.res);
    expect(footX).toBeGreaterThan(40);
    for (const [action] of ACTIONS)
      for (const dir of BAKED) {
        const feet: number[] = [];
        for (let i = 0; i < framesIn(action); i++) {
          const img = load(frameFile(hero, action, dir, i));
          const b = bbox(img);
          const at = `${action}/${dir}#${String(i)}`;
          expect(b, at).toBeDefined();
          if (!b) continue;
          expect(Math.min(b[0], b[1], img.width - 1 - b[2], img.height - 1 - b[3]), `${at} margin`).toBeGreaterThanOrEqual(2);
          // the body's lowest solid row (the soft contact shadow is under alpha 160)
          feet.push(bbox(img, 160, footX - 40, footX + 40)?.[3] ?? 0);
          expect(haloShare(img), `${at} halo`).toBeLessThan(0.05);
        }
        if (action === 'idle' || action === 'walk') expect(Math.max(...feet) - Math.min(...feet), `${action}/${dir} feet ${JSON.stringify(feet)}`).toBeLessThanOrEqual(3);
      }
  });

  it.each(HEROES)('%s: faces east in E (head bone ahead of the root)', (hero) => {
    const rig = JSON.parse(readFileSync(resolve(root, 'imgWorkArea/rigs', hero, 'rig.json'), 'utf8')) as { bones: { id: string; head: [number, number] }[] };
    const bone = (id: string): [number, number] | undefined => rig.bones.find((b) => b.id === id)?.head;
    expect((bone('head')?.[0] ?? 0) - (bone('root')?.[0] ?? 0)).toBeGreaterThan(0);
  });

  it.each(HEROES)('%s: keeps the painted detail (Laplacian variance >= 0.6x the portrait at the same size)', (hero) => {
    const frame = load(frameFile(hero, 'idle', 'E', 0));
    const portrait = load(resolve(root, 'public/assets/img/map', `${hero}Large.png`));
    const fb = bbox(frame, 160);
    const pb = bbox(portrait, 160);
    expect(fb && pb).toBeTruthy();
    if (!fb || !pb) return;
    const small = areaScale(portrait, (fb[3] - fb[1] + 1) / (pb[3] - pb[1] + 1));
    expect(laplacianVar(frame)).toBeGreaterThanOrEqual(0.6 * laplacianVar(small));
  });

  it('prep.lock.json pins every portrait-rig input and output that is in the repo', () => {
    const lock = JSON.parse(readFileSync(resolve(root, 'tools/assets/portrait-rig/prep.lock.json'), 'utf8')) as Record<string, { inputs: Record<string, string>; outputs: Record<string, string> }>;
    expect(Object.keys(lock).sort()).toEqual([...HEROES].sort());
    const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');
    for (const hero of HEROES) {
      const e = lock[hero];
      expect(e?.inputs['portrait']).toBe(sha(resolve(root, 'public/assets/img/map', `${hero}Large.png`)));
      expect(e?.inputs['spec']).toBe(sha(resolve(root, 'tools/assets/portrait-rig/spec', `${hero}.json`)));
      expect(e?.inputs['anim']).toBe(sha(resolve(root, 'tools/assets/portrait-rig/spec', `${hero}.anim.json`)));
      for (const [rel, h] of Object.entries(e?.outputs ?? {})) expect(sha(resolve(root, 'imgWorkArea/rigs', hero, rel)), `${hero}/${rel}`).toBe(h);
    }
  });
});

describe('hero-scale frame box helpers', () => {
  const img = (frame: { width: number; height: number; customData: object }, flipX = false): BoxedImage & { pos: [number, number]; size: [number, number] } => {
    const o = {
      x: 0,
      y: 0,
      flipX,
      displayWidth: 0,
      displayHeight: 0,
      frame,
      pos: [0, 0] as [number, number],
      size: [0, 0] as [number, number],
      setPosition(x: number, y: number) {
        o.x = x;
        o.y = y;
        o.pos = [x, y];
      },
      setDisplaySize(w: number, h: number) {
        o.displayWidth = w;
        o.displayHeight = h;
        o.size = [w, h];
      },
    };
    return o;
  };

  it('a frame without custom data or box fills the visual box', () => {
    expect(frameBox({ width: 80, height: 80, customData: undefined as unknown as object })).toBeUndefined();
    const i = img({ width: 80, height: 80, customData: {} });
    fitToBox(i, 10, 20, 160, 160);
    expect([i.pos, i.size]).toEqual([[10, 20], [160, 160]]);
  });

  it('maps a boxed frame onto the visual box, mirrored too, and drawnBox reads it back', () => {
    const f = { width: 240, height: 240, customData: {} };
    setFrameBox(f, { x: 20, y: 24, w: 200, h: 200 });
    expect(frameBox(f)).toEqual({ x: 20, y: 24, w: 200, h: 200 });
    for (const flip of [false, true]) {
      const i = img(f, flip);
      fitToBox(i, 100, 50, 160, 160);
      expect(i.size).toEqual([192, 192]);
      expect(i.pos).toEqual([100 - (flip ? 20 : 20) * 0.8, 50 - 24 * 0.8]);
      const out = { x: 0, y: 0, w: 0, h: 0 };
      expect(drawnBox(i, out)).toEqual({ x: 100, y: 50, w: 160, h: 160 });
    }
    // an off-centre box: the mirrored image shifts by the other side's overscan
    const g = { width: 240, height: 240, customData: {} };
    setFrameBox(g, { x: 10, y: 0, w: 200, h: 240 });
    const m = img(g, true);
    fitToBox(m, 0, 0, 100, 120);
    expect(m.pos[0]).toBeCloseTo(-30 * 0.5);
    expect(drawnBox(m, { x: 0, y: 0, w: 0, h: 0 })).toEqual({ x: 0, y: 0, w: 100, h: 120 });
  });
});
