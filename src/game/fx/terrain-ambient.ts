import type Phaser from 'phaser';
import { hash01 } from './grim-fx';

/**
 * Atmosphere of the Arcade arena (view only): per-element ambient motes and mist drifting over the floor, plus a vignette
 * with a soft light falloff over the whole view. Embers rise on the fire stage, cold droplets and low mist on water, dust and
 * spores on earth, fast wisps and cloud-banks on air. Motes are a pure function of (stage, index, time), drawn into one pooled
 * Graphics cleared each frame (nothing allocated per frame); reduced motion draws no motes and the mist holds still. The
 * vignette is one canvas texture repainted only when the stage changes, shown in the Hud scene so the camera's shake and pan
 * never move it. A persistent additive "lift" layer (a faint tinted wash plus soft glow pools, repainted on stage change) sits
 * between floor and heroes so the floor reads luminous while heroes stay punchy; kept low since the painted floors
 * (arenafloor.png) carry their own pool of light. No text, no sim state.
 */
type Gfx = Phaser.GameObjects.Graphics;

/** World band the motes fill: under the wall (terrain-stage-layout WALL_Y) to the bottom of the arena. */
const Y0 = 190;
const Y1 = 720;
const WORLD_W = 1920;
export const MOTES = 44;
export const MISTS = 7;
const VIGNETTE_KEY = 'tte-arena-vignette';
const VIG_W = 256;
const VIG_H = 144;
const VIG_DEPTH = -20;
/** Above the tile floor (-0.8) and its glow, under the patches (-0.7) and the heroes. */
const LIFT_DEPTH = -0.78;
const POOLS = 5;

/** Per stage (index 1..4): mote colour, mist colour, mist alpha per layer, vignette edge colour and strength (0..1). */
const LOOK = [
  { mote: 0xffa347, ash: 0xc9a58a, mist: 0x6a3420, mistA: 0.05, edge: 0x3a1208, edgeA: 0.5, glow: 0xb8481a, lift: 0x120a06 },
  { mote: 0xa8e2ff, ash: 0x9fc4d6, mist: 0x4a7a96, mistA: 0.06, edge: 0x0a2440, edgeA: 0.52, glow: 0x2f78a8, lift: 0x081420 },
  { mote: 0xe6d890, ash: 0xa6bb78, mist: 0x4a5a30, mistA: 0.05, edge: 0x1c2a0e, edgeA: 0.5, glow: 0x6a8a3a, lift: 0x0e1408 },
  { mote: 0xe4f0ff, ash: 0xb8c6dc, mist: 0x9cb0cc, mistA: 0.07, edge: 0x1a2840, edgeA: 0.46, glow: 0x7a92c0, lift: 0x0a0e1a },
] as const;

export interface Mote {
  x: number;
  y: number;
  r: number;
  a: number;
  /** Streak length (air wisps), 0 for a round mote. */
  len: number;
  /** 0 the stage's mote colour, 1 the ash / spore colour. */
  tone: 0 | 1;
}

const frac = (v: number): number => v - Math.floor(v);

/** Mote `i` of `stage` (1..4) at view time `t` in seconds, into `out`. Pure and periodic in `t`: no state. */
export function mote(stage: number, i: number, t: number, out: Mote): void {
  const s = stage * 131;
  const ph = frac(t * (0.025 + hash01(i, s) * 0.04) + hash01(i, s + 1));
  const bx = hash01(i, s + 2) * WORLD_W;
  const by = Y0 + hash01(i, s + 3) * (Y1 - Y0);
  out.tone = hash01(i, s + 4) < 0.3 ? 1 : 0;
  out.len = 0;
  out.r = 0.8 + hash01(i, s + 5) * 1.5;
  const fade = Math.sin(ph * Math.PI);
  if (stage === 1) {
    // Embers rise from the floor, wobbling, cooling as they climb.
    out.x = bx + Math.sin(t * 1.3 + i) * 14;
    out.y = Y1 - ph * (Y1 - Y0) * 0.9;
    out.a = fade * (out.tone === 1 ? 0.3 : 0.75);
  } else if (stage === 2) {
    // Cold motes sink slowly and glint; a few hang still.
    out.x = bx + Math.sin(t * 0.5 + i * 2) * 8;
    out.y = Y0 + ph * (Y1 - Y0);
    out.a = fade * 0.4 * (0.6 + 0.4 * Math.sin(t * 3 + i * 5));
    out.r *= 0.9;
  } else if (stage === 3) {
    // Dust and spores float up and sideways, lazily.
    out.x = frac(bx / WORLD_W + t * 0.004 * (0.5 + hash01(i, s + 6))) * WORLD_W;
    out.y = by - Math.sin(t * 0.4 + i) * 10 - ph * 30;
    out.a = fade * (out.tone === 1 ? 0.45 : 0.3);
  } else {
    // Wind wisps race across; thin streaks, some faint motes.
    out.x = frac(bx / WORLD_W + t * (0.03 + hash01(i, s + 6) * 0.05)) * WORLD_W;
    out.y = by + Math.sin(t * 0.8 + i) * 6;
    out.len = i % 3 === 0 ? 0 : 26 + hash01(i, s + 7) * 50;
    out.a = fade * 0.28;
  }
}

/** Mist bank `k`: centre, size and alpha at view time `t` (slow horizontal drift, wraps; pure). */
export function mist(stage: number, k: number, t: number, still: boolean): { x: number; y: number; w: number; h: number } {
  const s = stage * 977;
  const speed = stage === 4 ? 0.02 : stage === 2 ? 0.008 : 0.004;
  const drift = still ? 0 : t * speed;
  const w = 380 + hash01(k, s) * 320;
  return {
    x: frac(hash01(k, s + 1) + drift) * (WORLD_W + w) - w / 2,
    y: stage === 1 ? 560 + hash01(k, s + 2) * 130 : 250 + hash01(k, s + 2) * 420,
    w,
    h: 70 + hash01(k, s + 3) * 70,
  };
}

export interface Ambient {
  /** Draws the stage's motes and mist (0 none: clears). `t` is view time in seconds, `still` reduced motion, `alpha` the fade. */
  update(stage: number, t: number, still: boolean, alpha: number): void;
  /** The vignette's current stage (0 none; test probe). */
  readonly vignette: number;
  destroy(): void;
}

const hexA = (c: number, a: number): string => `rgba(${String((c >> 16) & 255)},${String((c >> 8) & 255)},${String(c & 255)},${String(a)})`;

/** Repaints the vignette canvas: clear centre, the stage's tint warming the middle ring, a dark edge, a darker top. */
function paintVignette(ctx: CanvasRenderingContext2D, stage: number): void {
  const look = LOOK[stage - 1];
  ctx.clearRect(0, 0, VIG_W, VIG_H);
  if (!look) return;
  const r = ctx.createRadialGradient(VIG_W / 2, VIG_H * 0.58, VIG_H * 0.22, VIG_W / 2, VIG_H * 0.58, VIG_W * 0.62);
  r.addColorStop(0, hexA(look.edge, 0));
  r.addColorStop(0.55, hexA(look.edge, look.edgeA * 0.2));
  r.addColorStop(1, hexA(look.edge, look.edgeA));
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, VIG_W, VIG_H);
  const top = ctx.createLinearGradient(0, 0, 0, VIG_H * 0.35);
  top.addColorStop(0, hexA(look.edge, 0.18));
  top.addColorStop(1, hexA(look.edge, 0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, VIG_W, VIG_H * 0.35);
}

/** `arena` gets the motes (world space); `hud` the vignette (screen space, never shaken). */
export function mountAmbient(arena: Phaser.Scene, hud: Phaser.Scene, depth: number): Ambient {
  const g: Gfx = arena.add.graphics().setDepth(depth);
  const m: Mote = { x: 0, y: 0, r: 0, a: 0, len: 0, tone: 0 };
  // Light lift (additive, over the floor, under the heroes): a tinted wash and a few soft pools of magic light, repainted per stage.
  const lift: Gfx = arena.add.graphics().setDepth(LIFT_DEPTH).setBlendMode('ADD');
  let liftStage = 0;
  let vig: Phaser.GameObjects.Image | undefined;
  let canvas: Phaser.Textures.CanvasTexture | undefined;
  let drawnVig = 0;

  const showVignette = (stage: number): void => {
    if (stage === drawnVig) return;
    drawnVig = stage;
    if (!vig) {
      const existing = hud.textures.exists(VIGNETTE_KEY);
      canvas = existing ? (hud.textures.get(VIGNETTE_KEY) as Phaser.Textures.CanvasTexture) : hud.textures.createCanvas(VIGNETTE_KEY, VIG_W, VIG_H) ?? undefined;
      if (!canvas) return;
      const cam = hud.cameras.main;
      vig = hud.add.image(0, 0, VIGNETTE_KEY).setOrigin(0, 0).setDisplaySize(cam.width, cam.height).setDepth(VIG_DEPTH).setScrollFactor(0);
    }
    const ctx = canvas?.getContext();
    if (ctx) {
      paintVignette(ctx, stage);
      canvas?.refresh();
    }
    vig.setVisible(stage > 0);
  };

  const paintLift = (stage: number): void => {
    if (stage === liftStage) return;
    liftStage = stage;
    lift.clear();
    const look = LOOK[stage - 1];
    if (!look) return;
    lift.fillStyle(look.lift, 1).fillRect(0, 0, WORLD_W, Y1);
    for (let k = 0; k < POOLS; k++) {
      const cx = ((k + 0.5) / POOLS) * WORLD_W;
      const cy = 330 + hash01(k, stage * 53) * 240;
      const w = 520 + hash01(k, stage * 53 + 1) * 260;
      for (let i = 0; i < 5; i++) lift.fillStyle(look.glow, 0.03).fillEllipse(cx, cy, w * (1 - i * 0.17), w * 0.5 * (1 - i * 0.17));
    }
  };

  return {
    update(stage, t, still, alpha): void {
      showVignette(stage);
      paintLift(stage);
      lift.setAlpha(alpha).setVisible(stage > 0);
      g.clear();
      const look = LOOK[stage - 1];
      if (!look || alpha <= 0) return;
      // Mist banks first (two stacked soft ellipses each), under the motes.
      for (let k = 0; k < MISTS; k++) {
        const b = mist(stage, k, t, still);
        g.fillStyle(look.mist, look.mistA * alpha).fillEllipse(b.x, b.y, b.w, b.h);
        g.fillStyle(look.mist, look.mistA * 0.8 * alpha).fillEllipse(b.x, b.y, b.w * 0.62, b.h * 0.6);
      }
      if (still) return;
      for (let i = 0; i < MOTES; i++) {
        mote(stage, i, t, m);
        const a = m.a * alpha;
        if (a < 0.02) continue;
        const c = m.tone === 1 ? look.ash : look.mote;
        if (m.len > 0) g.lineStyle(1, c, a).lineBetween(m.x, m.y, m.x + m.len, m.y);
        else {
          g.fillStyle(c, a * 0.3).fillCircle(m.x, m.y, m.r * 3.4);
          g.fillStyle(c, a).fillCircle(m.x, m.y, m.r);
        }
      }
    },
    get vignette(): number {
      return drawnVig;
    },
    destroy(): void {
      g.destroy();
      lift.destroy();
      vig?.destroy();
      vig = undefined;
      if (canvas && hud.textures.exists(VIGNETTE_KEY)) hud.textures.remove(VIGNETTE_KEY);
      canvas = undefined;
    },
  };
}
