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

/** A pale, desaturated light of a hazard colour: the luminous core of the tide and gust strike marks (readable on blue and on pale ice). */
export const HAZARD_LIGHTS: readonly number[] = [0xffffff, 0xf0c8a0, 0xbfe4f2, 0xdcc49a, 0xf2f6f8];

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

/** Screen-reader line for a hazard warning (no words on screen; this is the audible twin of the telegraph). */
export function hazardAnnouncement(kind: number): string {
  const what = ['', 'Lava strip', 'Tide', 'Falling rock', 'Gale'][kind];
  return what ? `Warning: ${what} incoming.` : '';
}

/** A tapered streak scrolls `dir` across the box in dark and pale pairs (reads on pale air and on blue water); returns how many. */
function streaks(g: Gfx, x: number, y: number, w: number, h: number, dir: number, shift: number, light: number, alpha: number): number {
  let n = 0;
  const gap = 160;
  const rows = Math.max(3, Math.floor(h / 36));
  for (let r = 0; r < rows; r++) {
    const sy = y + ((r + 0.5) * h) / rows;
    const off = (shift * 2 + r * 53) % gap;
    for (let sx = x + (dir > 0 ? off : gap - off) - gap; sx < x + w; sx += gap) {
      const a = Math.max(x, sx);
      const b = Math.min(x + w, sx + 70);
      if (b <= a) continue;
      g.lineStyle(4, 0x0a0e14, 0.4 * alpha).lineBetween(a, sy + 2, b, sy + 2);
      g.lineStyle(2, light, 0.8 * alpha).lineBetween(a, sy, b, sy);
      n++;
    }
  }
  return n;
}

/** Large arrows on both side edges of a lane pointing `dir`: the warning's unmissable direction cue (also reads at phone size). */
function edgeArrows(g: Gfx, x: number, y: number, w: number, h: number, dir: number, light: number, alpha: number): void {
  const size = Math.min(46, h / 5);
  for (const ex of [x + 40, x + w - 40]) {
    for (const cy of [y + h * 0.25, y + h * 0.5, y + h * 0.75]) {
      for (const [lw, c, a] of [[9, 0x0a0806, 0.5 * alpha], [5, light, 0.9 * alpha]] as const) {
        g.lineStyle(lw, c, a).lineBetween(ex - dir * size, cy - size, ex, cy).lineBetween(ex, cy, ex - dir * size, cy + size);
      }
    }
  }
}

/** Warning progress 0..1 as `warnLeft` runs down from `warnTotal` (the countdown the rockfall shadow and the fire fill follow). */
export function warnProgress(warnLeft: number, warnTotal: number): number {
  return 1 - Math.min(1, Math.max(0, warnLeft / Math.max(1, warnTotal)));
}

/** Radius of the falling-rock shadow: grows from a quarter of the box's half-width to the full square as the strike nears. */
export function shadowRadius(progress: number, halfW: number): number {
  return halfW * (0.25 + 0.75 * Math.min(1, Math.max(0, progress)));
}

/** Impact flash alpha: white for the first 2 ticks of the active phase (steady, not blinking, so safe with reduced motion), else 0. */
export function impactFlash(ticksSinceStrike: number): number {
  return ticksSinceStrike >= 0 && ticksSinceStrike < 2 ? 0.55 : 0;
}

const states = new WeakMap<Phaser.Scene, () => readonly HazardMarker[]>();

/** The hazard drawn on the last frame (test probe: empty with none live), or undefined before the view mounts or after teardown. */
export function hazardState(arena: Phaser.Scene): readonly HazardMarker[] | undefined {
  return states.get(arena)?.();
}

type Gfx = Phaser.GameObjects.Graphics;

/** Chevrons pointing `dir` (+1 right, -1 left) across the box, rows `row` px apart; returns how many were drawn. */
function chevrons(g: Gfx, x: number, y: number, w: number, h: number, dir: number, shift: number, color: number, alpha: number, halo = false): number {
  const gap = 72;
  const row = Math.min(90, Math.max(40, h / 3));
  const arm = 11;
  let n = 0;
  // `halo` strikes: a dark outline pass under a bright core, so the marks read on blue water and on pale ice alike.
  for (const [width, c, a] of halo ? ([[8, 0x0a0806, 0.55 * alpha], [4, color, alpha]] as const) : ([[3, color, alpha]] as const)) {
    n = 0;
    g.lineStyle(width, c, a);
    chevronPass(g, x, y, w, h, dir, shift, gap, row, arm, () => { n++; });
  }
  return n;
}

function chevronPass(g: Gfx, x: number, y: number, w: number, h: number, dir: number, shift: number, gap: number, row: number, arm: number, count: () => void): void {
  for (let cy = y + row / 2; cy < y + h; cy += row) {
    const stagger = (Math.round((cy - y) / row) % 2) * (gap / 2);
    for (let cx = x + ((shift + stagger) % gap); cx < x + w; cx += gap) {
      g.lineBetween(cx - dir * arm, cy - arm, cx, cy).lineBetween(cx, cy, cx - dir * arm, cy + arm);
      count();
    }
  }
}

export function mountHazardView(arena: Phaser.Scene, view: RenderView, reduceMotion: () => boolean): void {
  let parts: { g: Gfx; glow: Gfx } | undefined;
  let markers: HazardMarker[] = [];
  let warnTotal = 1;
  let announcedKind = 0;
  let strikeTick = -1000;
  let wasWarn = false;
  let live: HTMLElement | undefined;
  const announce = (kind: number): void => {
    if (typeof document === 'undefined') return;
    if (!live) {
      live = document.createElement('div');
      live.setAttribute('role', 'status');
      live.setAttribute('data-hazard-live', '');
      live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
      document.body.appendChild(live);
    }
    live.textContent = hazardAnnouncement(kind);
  };

  const draw = (): void => {
    const ar = view.arcade();
    if (!ar) return;
    parts ??= { g: arena.add.graphics().setDepth(DEPTH), glow: arena.add.graphics().setDepth(DEPTH + 0.01).setBlendMode(1) };
    const g = parts.g.clear();
    const glow = parts.glow.clear();
    markers = [];
    const [kind = 0, x = 0, y = 0, w = 0, h = 0, dir = 0, warnLeft = 0, endLeft = 0] = ar.hazard.slice(0, HAZARD_VIEW_STRIDE);
    if (kind === 0) {
      announcedKind = 0;
      return;
    }
    if (warnLeft > 0 && announcedKind !== kind) {
      announcedKind = kind;
      announce(kind);
    }
    const reduced = reduceMotion();
    const col = HAZARD_COLORS[kind] ?? 0xffffff;
    const tick = view.tick;
    const lane = kind === 2 || kind === 4;
    let alpha: number;
    let drawn = 0;
    if (wasWarn && warnLeft <= 0) strikeTick = tick;
    wasWarn = warnLeft > 0;
    if (warnLeft > 0) {
      warnTotal = Math.max(warnTotal, warnLeft);
      alpha = hazardWarnAlpha(warnLeft, warnTotal, tick, reduced);
      // A dark underlay then the muted element outline: reads on any floor. A full-field tide gets only its chevrons and edge bars.
      const light = HAZARD_LIGHTS[kind] ?? col;
      g.fillStyle(lane ? 0x0a0e14 : col, lane ? 0.14 * alpha : 0.12 * alpha).fillRect(x, y, w, h);
      if (lane) g.fillStyle(col, 0.2 * alpha).fillRect(x, y, w, h);
      g.lineStyle(6, 0x0a0806, 0.5 * alpha).strokeRect(x, y, w, h);
      g.lineStyle(3, lane ? light : col, alpha).strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      if (lane) {
        // Tide and gust (r20): bright edge bars, scrolling dark/pale streaks, big edge arrows and the chevrons, all steady under reduced motion.
        g.fillStyle(light, 0.6 * alpha).fillRect(x, y, w, 5).fillRect(x, y + h - 5, w, 5);
        glow.fillStyle(light, 0.08 * alpha).fillRect(x, y, w, h);
        const shift = chevronShift(tick, dir, 72, reduced);
        streaks(g, x, y, w, h, dir, shift, light, alpha);
        edgeArrows(g, x, y, w, h, dir, light, alpha);
        drawn = chevrons(g, x, y, w, h, dir, shift, light, 0.8 * alpha, true);
      } else {
        // r21: a filled warning tint that firms with the countdown (dark red on lava, pale dust on stone), so the box never reads as a thin outline on a busy floor.
        const pr = warnProgress(warnLeft, warnTotal);
        if (kind === 1) {
          g.fillStyle(0x3a0c06, (0.3 + 0.3 * pr) * alpha).fillRect(x, y, w, h);
          g.fillStyle(0xf4d4b0, 0.55 * alpha).fillRect(x, y, w, 5).fillRect(x, y + h - 5, w, 5).fillRect(x, y, 5, h).fillRect(x + w - 5, y, 5, h);
          // A countdown tick: a pale bar filling up the lane's centre.
          g.fillStyle(0x0a0806, 0.5 * alpha).fillRect(x + w / 2 - 6, y + 10, 12, h - 20);
          g.fillStyle(0xf4d4b0, 0.85 * alpha).fillRect(x + w / 2 - 4, y + h - 10 - (h - 20) * pr, 8, (h - 20) * pr);
        } else {
          g.fillStyle(0xd8c8a8, (0.14 + 0.16 * pr) * alpha).fillRect(x, y, w, h);
          // The falling shadow: a dark disc that grows to fill the square, ringed in pale dust.
          const r = shadowRadius(pr, w / 2);
          g.fillStyle(0x0d0a07, (0.25 + 0.3 * pr) * alpha).fillCircle(x + w / 2, y + h / 2, r);
          g.lineStyle(3, 0xf0e4c8, 0.8 * alpha).strokeCircle(x + w / 2, y + h / 2, r);
          g.lineStyle(4, 0xf0e4c8, 0.75 * alpha);
          for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]] as const) {
            g.lineBetween(cx, cy, cx + sx * 26, cy).lineBetween(cx, cy, cx, cy + sy * 26);
          }
        }
        // Fire and earth: a cross-hatch of warning stripes inside the box (fire's is pale-hot so it reads on the orange floor).
        if (kind === 1) glow.fillStyle(HAZARD_LIGHTS[1] ?? col, 0.12 * alpha).fillRect(x + w * 0.25, y, w * 0.5, h);
        g.lineStyle(2, kind === 1 ? (HAZARD_LIGHTS[1] ?? col) : col, (kind === 1 ? 0.5 : 0.3) * alpha);
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
        // r20: a white-hot core and bright rim so the strip separates from the orange floor.
        g.fillStyle(0xfff0d8, 0.8 * alpha).fillRect(x + w / 2 - 9, y, 18, h);
        glow.fillStyle(0xffe2b0, 0.4 * alpha).fillRect(x + w / 2 - 22, y, 44, h);
        g.lineStyle(3, 0xfff0d8, 0.7 * alpha).strokeRect(x + 2, y + 2, w - 4, h - 4);
        g.lineStyle(5, 0x0a0806, 0.5 * alpha).strokeRect(x - 2, y - 2, w + 4, h + 4);
      } else if (kind === 3) {
        // Fallen rock: a dark slab with a muted face and a crack.
        g.fillStyle(0x0d0a07, 0.6 * alpha).fillRect(x, y, w, h);
        g.fillStyle(col, 0.75 * alpha).fillRect(x + 10, y + 10, w - 20, h - 20);
        g.lineStyle(3, 0x0d0a07, 0.7 * alpha).lineBetween(x + w * 0.3, y + 12, x + w * 0.5, y + h * 0.55).lineBetween(x + w * 0.5, y + h * 0.55, x + w * 0.42, y + h - 12);
      } else {
        // Tide and gust (r19): a darker body, bright edge bars, an additive wash and luminous chevrons with a dark halo.
        const light = HAZARD_LIGHTS[kind] ?? 0xffffff;
        g.fillStyle(0x0a0e14, 0.16 * alpha).fillRect(x, y, w, h);
        g.fillStyle(col, 0.22 * alpha).fillRect(x, y, w, h);
        g.fillStyle(light, 0.7 * alpha).fillRect(x, y, w, 4).fillRect(x, y + h - 4, w, 4);
        glow.fillStyle(light, 0.1 * alpha).fillRect(x, y, w, h);
        drawn = chevrons(g, x, y, w, h, dir, chevronShift(tick, dir, 72, reduced), light, 0.9 * alpha, true);
        streaks(g, x, y, w, h, dir, chevronShift(tick, dir, 72, reduced), light, alpha);
      }
    }
    const flash = warnLeft > 0 ? 0 : impactFlash(tick - strikeTick);
    if (flash > 0) glow.fillStyle(0xffffff, flash).fillRect(x, y, w, h);
    markers.push({ kind, phase: warnLeft > 0 ? 'warn' : 'active', x, y, w, h, dir, alpha, chevrons: drawn });
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    parts?.g.destroy();
    parts?.glow.destroy();
    parts = undefined;
    live?.remove();
    live = undefined;
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => markers);
}
