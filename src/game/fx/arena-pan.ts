import type Phaser from 'phaser';
import { EntityFlag, arcadePlayfield, type RenderCharacter, type RenderView } from '@core/index';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, enableWideView, resolutionOf, viewWidth } from '../boot/viewport';
import { arcadeHeroScale } from '../views/hero-scale';
import { cameraTarget, punchAnchor, type CameraFraming } from './arena-camera';
import { KO_PUNCH_ZOOM, koPunchZoom, KO_PUNCH_MS } from './hit-feel';

/**
 * Phaser side of the panning Arcade camera (WP 38b). View only: it reads the render view and moves `cameras.main`; nothing
 * flows back into the sim. While the playfield is no wider than the view the framing is pinned at the fit camera, so the
 * picture is identical to `fitScene`. The view is 1280 logical px wide, or wider on a wide phone (viewport.ts `enableWideView`). The super cinematic composes on top through `applyCamera` and `viewBox`.
 */

/** A frame-to-frame jump of the fighters' midpoint this big is a round reset or a swap, not movement: snap instead of easing. */
const SNAP_JUMP_PX = 400;
const BENCHED_OR_DEAD = EntityFlag.benched | EntityFlag.dead;

interface PanState {
  centerX: number;
  zoom: number;
  /** True while the super cinematic owns the camera. */
  hold: boolean;
  /** Age in ms of the KO punch-in, or -1 when none runs. */
  punchAge: number;
  /** World point the KO punch-in pushes toward (the KO'd fighter), or null for the fighters' midpoint. */
  punchAt: { x: number; y: number } | null;
}

const states = new WeakMap<Phaser.Scene, PanState>();
const state = (scene: Phaser.Scene): PanState => {
  let s = states.get(scene);
  if (!s) {
    s = { centerX: LOGICAL_WIDTH / 2, zoom: 1, hold: false, punchAge: -1, punchAt: null };
    states.set(scene, s);
  }
  return s;
};

/** The pan framing now (centre x in world px; zoom over the fit zoom). */
export function panFraming(scene: Phaser.Scene): CameraFraming {
  const s = state(scene);
  return { centerX: s.centerX, zoom: s.zoom };
}

/** Starts the renderer-only KO punch-in (camera eases in a little, then back). */
export function koPunch(scene: Phaser.Scene, at?: { x: number; y: number }): void {
  const s = state(scene);
  s.punchAge = 0;
  if (!at) {
    s.punchAt = null;
    return;
  }
  // Zoom about a point that keeps the (drawn, ~96 px half-width) victim inside the picture, not about the victim itself.
  const vb = viewBox(scene, 1);
  const sx = (at.x - vb.x) / vb.scale;
  const a = punchAnchor(sx - KO_DRAWN_HALF / vb.scale, sx + KO_DRAWN_HALF / vb.scale, KO_PUNCH_ZOOM, LOGICAL_WIDTH, 40, 40);
  s.punchAt = { x: vb.x + a * vb.scale, y: at.y };
}

/** Drawn half-width (world px) of a KO'd hero, for the punch-in anchor. */
const KO_DRAWN_HALF = 96;

/** The super cinematic takes (true) or gives back (false) the camera. */
export function holdCamera(scene: Phaser.Scene, hold: boolean): void {
  state(scene).hold = hold;
}

/**
 * Zooms the camera by `z` over the pan framing about world point (px, py), which keeps its place on screen;
 * z = 1 is the pan framing itself (and, pinned, `fitScene`).
 */
export function applyCamera(scene: Phaser.Scene, z = 1, px = LOGICAL_WIDTH / 2, py = LOGICAL_HEIGHT / 2): void {
  const s = state(scene);
  const res = resolutionOf(scene);
  scene.cameras.main.setZoom(res * s.zoom * z).centerOn(px - (px - s.centerX) / z, py - (py - LOGICAL_HEIGHT / 2) / z);
}

/**
 * Where the visible window is, in world px, for screen-space overlays: top-left `x`,`y` and `scale` (world px per logical
 * screen px). An overlay laid out in 1280x720 screen units is placed at `x + sx * scale` and scaled by `scale`.
 */
export function viewBox(scene: Phaser.Scene, z = 1, px = LOGICAL_WIDTH / 2, py = LOGICAL_HEIGHT / 2): { x: number; y: number; scale: number } {
  const s = state(scene);
  const total = s.zoom * z;
  const cx = px - (px - s.centerX) / z;
  const cy = py - (py - LOGICAL_HEIGHT / 2) / z;
  return { x: cx - LOGICAL_WIDTH / 2 / total, y: cy - LOGICAL_HEIGHT / 2 / total, scale: 1 / total };
}

/**
 * Mounts the pan camera in the Arena `scene` (Arcade); it removes itself when the scene shuts down. It also turns on the wide
 * view (QA r19): a wide phone shows more of the world instead of side bars, and the pan keeps that wider view inside the walls.
 */
export function mountArenaPan(scene: Phaser.Scene, view: RenderView, alpha: () => number, reducedMotion: () => boolean): void {
  const s = state(scene);
  enableWideView(scene, arcadePlayfield().w);
  const mid = { x1: 0, x2: 0, n1: 0, n2: 0, reach: 40 };
  const visit = (c: RenderCharacter): void => {
    if ((c.flags & BENCHED_OR_DEAD) !== 0) return;
    const x = c.px + (c.x - c.px) * alpha() + c.w / 2;
    mid.reach = Math.max(mid.reach, (arcadeHeroScale(c.h) * c.w) / 2);
    if (c.team === 0 && mid.n1++ === 0) mid.x1 = x;
    else if (c.team !== 0 && mid.n2++ === 0) mid.x2 = x;
  };
  /** Advances the KO punch-in clock and returns its zoom multiplier (1 when none runs). */
  const punchZoom = (delta: number): number => {
    if (s.punchAge < 0) return 1;
    s.punchAge += delta;
    if (s.punchAge >= KO_PUNCH_MS) {
      s.punchAge = -1;
      s.punchAt = null;
      return 1;
    }
    return koPunchZoom(s.punchAge, reducedMotion());
  };
  let lastMid = Number.NaN;
  let lastTick = -1;
  let first = true;
  const update = (_time: number, delta: number): void => {
    if (s.hold) return;
    mid.n1 = mid.n2 = 0;
    mid.reach = 40;
    view.forEachCharacter(visit);
    // A fighter missing (the KO'd one is dead, so the punch-in must still run): keep the framing where it is.
    if (mid.n1 === 0 || mid.n2 === 0) {
      const p = punchZoom(delta);
      if (p !== 1) applyCamera(scene, p, s.punchAt?.x ?? s.centerX, s.punchAt?.y ?? LOGICAL_HEIGHT / 2);
      return;
    }
    const midpoint = (mid.x1 + mid.x2) / 2;
    const snap = first || view.tick < lastTick || Math.abs(midpoint - lastMid) > SNAP_JUMP_PX;
    first = false;
    lastMid = midpoint;
    lastTick = view.tick;
    const next = cameraTarget(
      { x1: mid.x1, x2: mid.x2, worldWidth: arcadePlayfield().w, reach: mid.reach, viewWidth: viewWidth(scene), reducedMotion: reducedMotion() },
      s,
      delta / 1000,
      snap,
    );
    s.centerX = next.centerX;
    s.zoom = next.zoom;
    const punch = punchZoom(delta);
    applyCamera(scene, punch, s.punchAt?.x ?? midpoint, s.punchAt?.y ?? LOGICAL_HEIGHT / 2);
  };
  scene.events.on('update', update);
  const off = (): void => {
    scene.events.off('update', update).off('shutdown', off).off('destroy', off);
    states.delete(scene);
  };
  scene.events.once('shutdown', off);
  scene.events.once('destroy', off);
}
