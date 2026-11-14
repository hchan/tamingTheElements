import type Phaser from 'phaser';
import { hash01 } from './grim-fx';
import { getPrefs } from '../platform/a11y/prefs';

/**
 * Load-time "grim" grade for the hero art (owner: sprites read as bright and cartoony, with hard black outlines). The shipped
 * strips and sheets are NOT re-baked: each sheet texture is copied once to a canvas, graded, and cached as `<key>~grim` in the
 * texture manager (the same approach as the action-bar icons). The grade is milder than the icons' so that element colours stay
 * apart: a light desaturation, a barely-there darken (owner: too dark, mystic not murk; heroes pop against the lifted floor),
 * lifted outline blacks (a soft umber instead of hard black) and a little grain. Alpha is untouched. The painted portrait heroes
 * (PAINTED_HEROES, ADR-0020) are never graded: their art is the painting itself.
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

export const HERO_GRADE: HeroGrade = { keep: 0.88, darken: 0.04, grain: 3, outline: [52, 44, 46], outlineLift: 0.6 };

/** Suffix of the cached graded copy (`map:fiara` -> `map:fiara~grim`). */
export const GRIM_SUFFIX = '~grim';
export const grimKey = (key: string): string => `${key}${GRIM_SUFFIX}`;

/**
 * Heroes whose art is the painted portrait itself (tools/assets/portrait-rig, ADR-0020): drawn as baked everywhere (sheet, map
 * strip, HUD picture), never graded, since the ink lift would flatten their painted shadows.
 */
export const PAINTED_HEROES: ReadonlySet<string> = new Set(['pax', 'sindarosa', 'curomo']);
const painted = (key: string): boolean => PAINTED_HEROES.has(key.replace(/^[a-z]+:/, ''));

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

/** Rim colour (0..255 RGB) per hero; heroes not listed get the cool default. Lavax is warm ember so it parts from the painted Pax. */
const RIM_DEFAULT: readonly [number, number, number] = [206, 228, 255];
const RIM_BY_HERO: Readonly<Record<string, readonly [number, number, number]>> = {
  lavax: [255, 176, 96],
  echo: [226, 240, 255],
  wispera: [226, 240, 255],
};
/** Mean luma (0..255) under which a hero counts as dark and gets its body lifted a little as well as a stronger rim. */
const DARK_MEAN = 96;
/** Alpha under which a pixel is a faint fringe: no rim, no lift (ghostly heroes such as Echo and Wispera are mostly semi-opaque). */
const MIN_A = 24;
/** Share of the missing opacity a dark sprite's semi-transparent pixels regain, so a dark ghost holds its shape on a pale floor. */
const DARK_ALPHA_LIFT = 0.3;

/**
 * Rim light for the legacy bitmap heroes (they have no painted light of their own): the one-pixel inner edge of every
 * sprite shape is lit toward `rim`, harder on the top and left edges (key light from above-left) and harder the darker the
 * pixel is, so a dark hero (Echo) keeps a bright silhouette on a dark or blue-grey floor. A second inner ring gets a faint
 * share for a soft, painted falloff. Dark sprites (low mean luma) also get a mild body lift. In place over a `w` x `h` RGBA
 * sheet; alpha only rises on dark sprites and nothing is drawn outside the shape, so neighbouring frames never bleed. Deterministic.
 */
export function rimLightRgba(px: Uint8ClampedArray | number[], w: number, h: number, rim: readonly [number, number, number] = RIM_DEFAULT): void {
  const src = Array.from(px);
  const a = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : (src[(y * w + x) * 4 + 3] ?? 0));
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 3 < src.length; i += 4) {
    if ((src[i + 3] ?? 0) < MIN_A) continue;
    sum += (src[i] ?? 0) * 0.3 + (src[i + 1] ?? 0) * 0.59 + (src[i + 2] ?? 0) * 0.11;
    n++;
  }
  const dark = n > 0 && sum / n < DARK_MEAN;
  const lift = dark ? 0.16 * (1 - sum / n / DARK_MEAN) + 0.06 : 0;
  let self = 255;
  const open = (x: number, y: number): boolean => a(x, y) < self * 0.5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      self = src[i + 3] ?? 0;
      if (self < MIN_A) continue;
      let t = 0;
      const top = open(x, y - 1) || open(x - 1, y - 1);
      const left = open(x - 1, y);
      const bottom = open(x, y + 1);
      const right = open(x + 1, y);
      if (top || left || bottom || right) t = top || left ? 1 : 0.6;
      else if (open(x, y - 2) || open(x - 2, y) || open(x, y + 2) || open(x + 2, y)) t = 0.3;
      const yl = (src[i] ?? 0) * 0.3 + (src[i + 1] ?? 0) * 0.59 + (src[i + 2] ?? 0) * 0.11;
      const k = t * (dark ? 0.62 : 0.4) * (0.55 + 0.45 * (1 - yl / 255));
      for (let c = 0; c < 3; c++) {
        const v = src[i + c] ?? 0;
        const lifted = v + (255 - v) * lift;
        px[i + c] = Math.round(Math.min(255, lifted + ((rim[c] ?? 255) - lifted) * k));
      }
      if (dark && self < 255) px[i + 3] = Math.round(self + (255 - self) * DARK_ALPHA_LIFT);
    }
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
 * The graded copy of texture `key` (made once, frames copied from the source), or `key` itself when grading is off, the hero is
 * painted (PAINTED_HEROES), the source has
 * no canvas-readable image (tests, odd sources) or anything throws, so the hero always shows. Frames added to the source later must
 * be added to the copy by the caller (`addGradedFrame`).
 */
export function gradedHeroTexture(scene: Phaser.Scene, key: string): string {
  if (!gradeEnabled() || painted(key)) return key;
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
    const hero = key.replace(/^[a-z]+:/, '');
    rimLightRgba(data.data, c.width, c.height, RIM_BY_HERO[hero] ?? RIM_DEFAULT);
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
 * registers `right0`/`left0`, which logged "missing frame map:<hero>~grim right0"), with their custom data (the portrait
 * rigs' visual box). Runs every draw, so it is a cheap no-op when the counts match (frames are only ever added).
 */
function syncFrames(scene: Phaser.Scene, key: string, gk: string): void {
  if (!scene.textures.exists(key)) return;
  const srcTex = scene.textures.get(key);
  const tex = scene.textures.get(gk);
  if (srcTex.frameTotal === tex.frameTotal) return;
  for (const name of srcTex.getFrameNames()) {
    if (tex.has(name)) continue;
    const f = srcTex.get(name);
    const added = tex.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
    if (added) Object.assign(added.customData, f.customData);
  }
}
