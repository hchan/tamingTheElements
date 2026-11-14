import type Phaser from 'phaser';
import { HAZARD_VIEW_STRIDE, type RenderView } from '@core/index';
import { mute } from './grim-fx';

/**
 * Phaser side of the Arcade stage hazard (systems/arcade/hazard.ts; ideas/brainstorm/stage-selection-hazards.md). The Arena
 * mounts it in every Arcade match (a lazy chunk) and it draws `RenderArcade.hazard`: during the warning a pulsing outline
 * of the box with a faint fill that firms up as the strike nears; once it strikes, the element's look (a lava column, a
 * fallen rock, drifting tide or gust chevrons). No words: the warning is shape and motion as well as colour (the outline,
 * the chevrons' direction). Reduced motion holds the pulse steady and stops the chevrons scrolling. One Graphics pair, one
 * `postupdate` listener, removed with the scene.
 */
const DEPTH = -0.65; // under the trap markers (-0.6) and the fighters

/** Muted element colour per hazard kind (index 0 unused): fire, water, earth, air. */
export const HAZARD_COLORS: readonly number[] = [0xffffff, 0xc4481c, 0x2f7394, 0x7d5c38, 0xa3bcc2].map((c, i) => (i === 0 ? c : mute(c, 0.7, 0.95)));

export interface HazardMarker {
  readonly kind: number;
  /** 'warn' before the strike, 'active' after it. */
  readonly phase: 'warn' | 'active';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly dir: number;
  /** The outline alpha drawn this frame. */
  readonly alpha: number;
  /** Chevrons drawn (tide and gust), 0 for the others. */
  readonly chevrons: number;
}

/** Warning outline alpha: firms from 0.35 to 0.8 as `warnLeft` runs down from `warnTotal`, blinking every 6 ticks unless `reduced`. */
export function hazardWarnAlpha(warnLeft: number, warnTotal: number, tick: number, reduced: boolean): number {
  const ramp = 0.35 + 0.45 * (1 - Math.min(1, Math.max(0, warnLeft / Math.max(1, warnTotal))));
  if (reduced) return ramp;
  return Math.floor(tick / 6) % 2 === 0 ? ramp : ramp * 0.55;
}

/** The scroll offset (px, 0..`gap`) of drifting chevrons: moves `dir` at 2 px a tick; 0 when `reduced`. */
export function chevronShift(tick: number, dir: number, gap: number, reduced: boolean): number {
  if (reduced) return 0;
  return (((tick * 2 * dir) % gap) + gap) % gap;
}

const states = new WeakMap<Phaser.Scene, () => readonly HazardMarker[]>();

/** The hazard drawn on the last frame (test probe: empty with none live), or undefined before the view mounts or after teardown. */
export function hazardState(arena: Phaser.Scene): readonly HazardMarker[] | undefined {
  return states.get(arena)?.();
}

type Gfx = Phaser.GameObjects.Graphics;

/** Chevrons pointing `dir` (+1 right, -1 left) across the box, rows `row` px apart; returns how many were drawn. */
function chevrons(g: Gfx, x: number, y: number, w: number, h: number, dir: number, shift: number, color: number, alpha: number): number {
  const gap = 72;
  const row = Math.min(90, Math.max(40, h / 3));
  const arm = 11;
  let n = 0;
  g.lineStyle(3, color, alpha);
  for (let cy = y + row / 2; cy < y + h; cy += row) {
    const stagger = (Math.round((cy - y) / row) % 2) * (gap / 2);
    for (let cx = x + ((shift + stagger) % gap); cx < x + w; cx += gap) {
      g.lineBetween(cx - dir * arm, cy - arm, cx, cy).lineBetween(cx, cy, cx - dir * arm, cy + arm);
      n++;
    }
  }
  return n;
}

export function mountHazardView(arena: Phaser.Scene, view: RenderView, reduceMotion: () => boolean): void {
  let parts: { g: Gfx; glow: Gfx } | undefined;
  let markers: HazardMarker[] = [];
  let warnTotal = 1;

  const draw = (): void => {
    const ar = view.arcade();
    if (!ar) return;
    parts ??= { g: arena.add.graphics().setDepth(DEPTH), glow: arena.add.graphics().setDepth(DEPTH + 0.01).setBlendMode(1) };
    const g = parts.g.clear();
    const glow = parts.glow.clear();
    markers = [];
    const [kind = 0, x = 0, y = 0, w = 0, h = 0, dir = 0, warnLeft = 0, endLeft = 0] = ar.hazard.slice(0, HAZARD_VIEW_STRIDE);
    if (kind === 0) return;
    const reduced = reduceMotion();
    const col = HAZARD_COLORS[kind] ?? 0xffffff;
    const tick = view.tick;
    const lane = kind === 2 || kind === 4;
    let alpha: number;
    let drawn = 0;
    if (warnLeft > 0) {
      warnTotal = Math.max(warnTotal, warnLeft);
      alpha = hazardWarnAlpha(warnLeft, warnTotal, tick, reduced);
      // A dark underlay then the muted element outline: reads on any floor. A full-field tide gets only its chevrons and edge bars.
      g.fillStyle(col, (lane ? 0.05 : 0.12) * alpha).fillRect(x, y, w, h);
      g.lineStyle(5, 0x0a0806, 0.45 * alpha).strokeRect(x, y, w, h);
      g.lineStyle(2, col, alpha).strokeRect(x + 1, y + 1, w - 2, h - 2);
      if (lane) drawn = chevrons(g, x, y, w, h, dir, chevronShift(tick, dir, 72, reduced), col, 0.35 * alpha);
      else {
        // Fire and earth: a cross-hatch of warning stripes inside the box.
        g.lineStyle(2, col, 0.3 * alpha);
        for (let d = 0; d < w + h; d += 28) g.lineBetween(x + Math.max(0, d - h), y + Math.min(h, d), x + Math.min(w, d), y + Math.max(0, d - w));
      }
    } else {
      warnTotal = 1;
      alpha = Math.min(1, endLeft / 10 + 0.3);
      if (kind === 1) {
        // Lava column: a dark smoky body under a soft additive core.
        g.fillStyle(0x140805, 0.55 * alpha).fillRect(x, y, w, h);
        g.fillStyle(col, 0.5 * alpha).fillRect(x + 8, y, w - 16, h);
        glow.fillStyle(col, 0.35 * alpha).fillRect(x + w / 2 - 14, y, 28, h);
      } else if (kind === 3) {
        // Fallen rock: a dark slab with a muted face and a crack.
        g.fillStyle(0x0d0a07, 0.6 * alpha).fillRect(x, y, w, h);
        g.fillStyle(col, 0.75 * alpha).fillRect(x + 10, y + 10, w - 20, h - 20);
        g.lineStyle(3, 0x0d0a07, 0.7 * alpha).lineBetween(x + w * 0.3, y + 12, x + w * 0.5, y + h * 0.55).lineBetween(x + w * 0.5, y + h * 0.55, x + w * 0.42, y + h - 12);
      } else {
        g.fillStyle(col, (kind === 2 ? 0.08 : 0.12) * alpha).fillRect(x, y, w, h);
        drawn = chevrons(g, x, y, w, h, dir, chevronShift(tick, dir, 72, reduced), col, 0.6 * alpha);
      }
    }
    markers.push({ kind, phase: warnLeft > 0 ? 'warn' : 'active', x, y, w, h, dir, alpha, chevrons: drawn });
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    parts?.g.destroy();
    parts?.glow.destroy();
    parts = undefined;
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => markers);
}
