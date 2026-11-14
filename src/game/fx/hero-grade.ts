import type Phaser from 'phaser';
import { hash01 } from './grim-fx';
import { getPrefs } from '../platform/a11y/prefs';

/**
 * Load-time "grim" grade for the hero art (owner: sprites read as bright and cartoony, with hard black outlines). The shipped
 * strips and sheets are NOT re-baked: each sheet texture is copied once to a canvas, graded, and cached as `<key>~grim` in the
 * texture manager (the same approach as the action-bar icons). The grade is milder than the icons' so that element colours stay
 * apart: a partial desaturation, a highlight-weighted darken (bright art drops, already-dark art such as Pax stays readable),
 * lifted outline blacks (a soft umber instead of hard black) and a little grain. Alpha is untouched.
 */

export interface HeroGrade {
  /** 0..1 share of the original saturation kept. */
  readonly keep: number;
  /** Darken applied at full brightness (0.16 = 16% off whites; shadows barely move). */
  readonly darken: number;
  /** Peak grain amplitude in 0..255 units. */
  readonly grain: number;
  /** Colour (0..255 per channel) the near-black outline pixels are lifted toward, and how far (0..1). */
  readonly outline: readonly [number, number, number];
  readonly outlineLift: number;
}

export const HERO_GRADE: HeroGrade = { keep: 0.6, darken: 0.24, grain: 4, outline: [38, 32, 30], outlineLift: 0.55 };

/** Suffix of the cached graded copy (`map:fiara` -> `map:fiara~grim`). */
export const GRIM_SUFFIX = '~grim';
export const grimKey = (key: string): string => `${key}${GRIM_SUFFIX}`;

/** Luma below which a pixel counts as outline ink. */
const INK_LUMA = 46;

/** In place over RGBA bytes. Deterministic (pixel-index hash, never Math.random). */
export function gradeHeroRgba(px: Uint8ClampedArray | number[], g: HeroGrade = HERO_GRADE): void {
  for (let i = 0; i + 3 < px.length; i += 4) {
    if ((px[i + 3] ?? 0) === 0) continue;
    const r = px[i] ?? 0;
    const gr = px[i + 1] ?? 0;
    const b = px[i + 2] ?? 0;
    const y = r * 0.3 + gr * 0.59 + b * 0.11;
    const shade = 1 - g.darken * (y / 255);
    const n = (hash01(i >> 2, 23) - 0.5) * 2 * g.grain;
    const lift = y < INK_LUMA ? g.outlineLift * (1 - y / INK_LUMA) : 0;
    const f = (c: number, ink: number): number => {
      const v = (y + (c - y) * g.keep) * shade + n;
      return Math.min(255, Math.max(0, Math.round(v + (ink - v) * lift)));
    };
    px[i] = f(r, g.outline[0]);
    px[i + 1] = f(gr, g.outline[1]);
    px[i + 2] = f(b, g.outline[2]);
  }
}

/** Reads the player's high-contrast preference; the grade is skipped then (flat, strongly separated colours are the point). */
export function gradeEnabled(): boolean {
  try {
    return !getPrefs().highContrast;
  } catch {
    return true;
  }
}

/**
 * The graded copy of texture `key` (made once, frames copied from the source), or `key` itself when grading is off, the source has
 * no canvas-readable image (tests, odd sources) or anything throws, so the hero always shows. Frames added to the source later must
 * be added to the copy by the caller (`addGradedFrame`).
 */
export function gradedHeroTexture(scene: Phaser.Scene, key: string): string {
  if (!gradeEnabled()) return key;
  const gk = grimKey(key);
  if (scene.textures.exists(gk)) {
    syncFrames(scene, key, gk);
    return gk;
  }
  try {
    if (typeof document === 'undefined' || !scene.textures.exists(key)) return key;
    const srcTex = scene.textures.get(key);
    const src = srcTex.getSourceImage() as CanvasImageSource & { width: number; height: number };
    if (!(src.width > 0)) return key;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return key;
    ctx.drawImage(src, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    gradeHeroRgba(data.data);
    ctx.putImageData(data, 0, 0);
    const tex = scene.textures.addCanvas(gk, c);
    if (!tex) return key;
    syncFrames(scene, key, gk);
    return gk;
  } catch {
    return key;
  }
}

/**
 * Copies frames the source gained after the graded copy was made (the HUD can grade a texture before the character view
 * registers `right0`/`left0`, which logged "missing frame map:<hero>~grim right0"). Cheap no-op when the counts match.
 */
function syncFrames(scene: Phaser.Scene, key: string, gk: string): void {
  if (!scene.textures.exists(key)) return;
  const srcTex = scene.textures.get(key);
  const tex = scene.textures.get(gk);
  if (srcTex.frameTotal === tex.frameTotal) return;
  for (const name of srcTex.getFrameNames()) {
    const f = srcTex.get(name);
    if (!tex.has(name)) tex.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
  }
}
