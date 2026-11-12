/**
 * Pure numbers of the Arcade stage backdrop (view only): the atlas layout `public/assets/img/stagebg.png` (written by
 * tools/assets/stage-gen/stagebg.py, which keeps the same constants) and the parallax and animation maths. No Phaser here.
 */

export const STAGE_TEXTURE = 'stagebg';
export const STAGE_URL = 'img/stagebg.png';

export const ATLAS_W = 2400;
export const FAR_H = 500;
export const CROWD_H = 80;
export const CROWD_FRAMES = 3;
export const FLY_W = 64;
export const FLY_H = 40;
export const CROWD_Y0 = 4 * FAR_H;
export const FLY_Y0 = CROWD_Y0 + 4 * CROWD_FRAMES * CROWD_H;
export const ATLAS_H = FLY_Y0 + FLY_H;

/** The world (Arcade playfield is 1920 wide) and where the backdrop sits: its bottom edge is the wall above the floor. */
export const WORLD_W = 1920;
/** World y of the wall: the tile floor starts here (terrain-floor.ts), the fighters' playfield a little below. */
export const WALL_Y = 184;
/** Parallax: the share of the camera's pan each layer follows (the world itself follows 1). */
export const FAR_FACTOR = 0.4;
export const FLY_FACTOR = 0.5;
export const CROWD_FACTOR = 0.7;

/** Atlas frame names. `stage` is 1 fire .. 4 air. */
export const farFrame = (stage: number): string => `far:${String(stage)}`;
export const crowdFrame = (stage: number, k: number): string => `crowd:${String(stage)}:${String(k)}`;
export const flyFrame = (stage: number, k: number): string => `fly:${String(stage)}:${String(k)}`;

export interface FrameRect {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Every frame of the atlas, in stage order. */
export function atlasFrames(): FrameRect[] {
  const out: FrameRect[] = [];
  for (let s = 1; s <= 4; s++) {
    out.push({ name: farFrame(s), x: 0, y: (s - 1) * FAR_H, w: ATLAS_W, h: FAR_H });
    for (let k = 0; k < CROWD_FRAMES; k++) out.push({ name: crowdFrame(s, k), x: 0, y: CROWD_Y0 + ((s - 1) * CROWD_FRAMES + k) * CROWD_H, w: ATLAS_W, h: CROWD_H });
    for (let k = 0; k < 2; k++) out.push({ name: flyFrame(s, k), x: ((s - 1) * 2 + k) * FLY_W, y: FLY_Y0, w: FLY_W, h: FLY_H });
  }
  return out;
}

/** Left edge of a layer in world px for a camera centred on `centerX`: it follows `factor` of the pan (centre 960 = rest). */
export function layerX(centerX: number, factor: number): number {
  return (WORLD_W - ATLAS_W) / 2 + (1 - factor) * (centerX - WORLD_W / 2);
}

/** The crowd's frame at `ms` of view time (about 5 cheers a second); 0 when still. */
export function crowdIndex(ms: number, still: boolean): number {
  return still ? 0 : Math.floor(ms / 200) % CROWD_FRAMES;
}

/** A drifter's offset along the layer in px (wrapping over the atlas width plus its own size); fixed when still. */
export function flyOffset(ms: number, which: number, still: boolean): number {
  const span = ATLAS_W + FLY_W;
  const start = (which * 1100 + 300) % span;
  return still ? start : (start + (ms / 1000) * (26 + which * 9)) % span - FLY_W;
}

/** The drifter's wing frame (flaps about 3 times a second); 0 when still. */
export function flyIndex(ms: number, which: number, still: boolean): number {
  return still ? 0 : Math.floor(ms / 170 + which) % 2;
}
