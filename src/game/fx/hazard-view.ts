import type Phaser from 'phaser';
import { HAZARD_VIEW_STRIDE, type RenderView } from '@core/index';
import { mute } from './grim-fx';
import { resolutionOf } from '../boot/viewport';

/**
 * Phaser side of the Arcade stage hazard (systems/arcade/hazard.ts; ideas/brainstorm/stage-selection-hazards.md). The Arena
 * mounts it in every Arcade match (a lazy chunk) and it draws `RenderArcade.hazard`: during the warning a pulsing outline
 * of the box with a faint fill that firms up as the strike nears; once it strikes, the element's look (a lava column, a
 * fallen rock, drifting tide or gust chevrons). The warning is shape and motion as well as colour (the outline,
 * the chevrons' direction) plus one short countdown chip. Reduced motion holds the pulse steady and stops the chevrons scrolling. One Graphics pair, one
 * `postupdate` listener, removed with the scene.
 */
/** The warning chip sits above the fighters so a fighter standing in the box never hides the word. */
const CHIP_DEPTH = 40;
/** The chip never rides higher than this screen y: the HUD's WEATHER meter and badge strip end near 195, and the HUD draws over the arena. */
export const CHIP_MIN_SCREEN_Y = 218;
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
  /** Direction marks drawn this frame (chevrons: every warning, and the tide and gust strikes), 0 otherwise. */
  readonly chevrons: number;
  /** The warning chip text this frame (e.g. `LAVA 2s`), '' once it strikes. */
  readonly label: string;
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
  return ['', 'Lava lane warning', 'Tide shift', 'Rockfall warning', 'Gust warning'][kind] ?? '';
}

/** Where an edge chevron sits when part of a warned box is outside the camera's view. */
export interface EdgeCue {
  /** The view edge the chevron sits on. */
  readonly side: 'left' | 'right' | 'top' | 'bottom';
  /** Along-the-edge position (world px), clamped inside the view and the box's span. */
  readonly pos: number;
}

/**
 * Edge cues for a warned box (pure): one per view edge the box crosses, so a lane that runs off-screen still shows where the
 * rest of it is. `view` is the camera's world view; none when the box is wholly inside or wholly outside (nothing to point at).
 */
export function edgeCues(view: { x: number; y: number; width: number; height: number }, box: { x: number; y: number; w: number; h: number }, inset = 28): EdgeCue[] {
  const vr = view.x + view.width;
  const vb = view.y + view.height;
  const br = box.x + box.w;
  const bb = box.y + box.h;
  if (br <= view.x || box.x >= vr || bb <= view.y || box.y >= vb) return [];
  const midY = Math.min(vb - inset, Math.max(view.y + inset, (Math.max(box.y, view.y) + Math.min(bb, vb)) / 2));
  const midX = Math.min(vr - inset, Math.max(view.x + inset, (Math.max(box.x, view.x) + Math.min(br, vr)) / 2));
  const out: EdgeCue[] = [];
  if (box.x < view.x) out.push({ side: 'left', pos: midY });
  if (br > vr) out.push({ side: 'right', pos: midY });
  if (box.y < view.y) out.push({ side: 'top', pos: midX });
  if (bb > vb) out.push({ side: 'bottom', pos: midX });
  return out;
}

/** A bold chevron on the view edge pointing outward at the off-screen part of the hazard (dark rim under a pale core). */
function edgeChevron(g: Gfx, view: { x: number; y: number; width: number; height: number }, cue: EdgeCue, light: number, alpha: number): void {
  const s = 22;
  const [ux, uy] = cue.side === 'left' ? [-1, 0] : cue.side === 'right' ? [1, 0] : cue.side === 'top' ? [0, -1] : [0, 1];
  const ax = ux === 0 ? cue.pos : ux < 0 ? view.x + 10 : view.x + view.width - 10;
  const ay = uy === 0 ? cue.pos : uy < 0 ? view.y + 10 : view.y + view.height - 10;
  for (const off of [0, 1]) {
    const bx = ax - ux * (off * 16 + s);
    const by = ay - uy * (off * 16 + s);
    for (const [lw, c, a] of [[10, 0x0a0806, 0.6 * alpha], [5, light, alpha]] as const) {
      g.lineStyle(lw, c, a)
        .lineBetween(bx + uy * s - ux * 0, by + ux * s - uy * 0, ax - ux * off * 16, ay - uy * off * 16)
        .lineBetween(ax - ux * off * 16, ay - uy * off * 16, bx - uy * s, by - ux * s);
    }
  }
}

/** Large arrows on both side edges of a lane pointing `dir`: the warning's unmissable direction cue (also reads at phone size). */
function edgeArrows(g: Gfx, x: number, y: number, w: number, h: number, dir: number, light: number, alpha: number, calm = false): void {
  const size = Math.min(46, h / 5);
  // `calm` (the gale): one arrow per side, not three, so the long lane does not read as a ladder of marks.
  const rows = calm ? [y + h * 0.5] : [y + h * 0.25, y + h * 0.5, y + h * 0.75];
  for (const ex of [x + 40, x + w - 40]) {
    for (const cy of rows) {
      for (const [lw, c, a] of [[9, 0x0a0806, 0.5 * alpha], [5, light, 0.9 * alpha]] as const) {
        g.lineStyle(lw, c, a).lineBetween(ex - dir * size, cy - size, ex, cy).lineBetween(ex, cy, ex - dir * size, cy + size);
      }
    }
  }
}

/**
 * Countdown for the tide and gust warning: a bar along the lane's centre that fills from the upwind edge toward `dir` as the
 * strike nears (full at the strike), on a dark rim so it reads on blue water and pale ice alike, with a bright head.
 */
function tideCountdown(g: Gfx, x: number, y: number, w: number, h: number, dir: number, pr: number, light: number, alpha: number): void {
  const bh = 16;
  const by = y + h / 2 - bh / 2;
  const bx = x + 90;
  const bw = w - 180;
  const fill = bw * pr;
  g.fillStyle(0x0a0e14, 0.55 * alpha).fillRect(bx - 4, by - 4, bw + 8, bh + 8);
  g.fillStyle(light, 0.9 * alpha).fillRect(dir > 0 ? bx : bx + bw - fill, by, fill, bh);
  g.fillStyle(0xffffff, 0.95 * alpha).fillRect(dir > 0 ? bx + fill - 4 : bx + bw - fill, by - 3, 4, bh + 6);
}

/** Warning progress 0..1 as `warnLeft` runs down from `warnTotal` (the countdown the rockfall ring and the fire fill follow). */
export function warnProgress(warnLeft: number, warnTotal: number): number {
  return 1 - Math.min(1, Math.max(0, warnLeft / Math.max(1, warnTotal)));
}

/** Short on-screen warning word per hazard kind (index 0 unused): fire lava lane, water tide, earth rockfall, air gust. */
export const HAZARD_WORDS: readonly string[] = ['', 'LAVA', 'TIDE', 'ROCKFALL', 'GUST'];

/** The warning chip text: the hazard word and the whole seconds left (50 ticks a second, rounded up), e.g. `ROCKFALL 2s`. */
export function hazardLabel(kind: number, warnLeft: number): string {
  const word = HAZARD_WORDS[kind] ?? '';
  return word === '' ? '' : `${word} ${String(Math.max(1, Math.ceil(warnLeft / 50)))}s`;
}

/** Impact flash alpha: white for the first 2 ticks of the active phase (steady, not blinking, so safe with reduced motion), else 0. */
export function impactFlash(ticksSinceStrike: number): number {
  return ticksSinceStrike >= 0 && ticksSinceStrike < 2 ? 0.55 : 0;
}

/** Ticks the rockfall dust and debris last after the strike (0.5 s at 50 Hz). */
export const DUST_TICKS = 25;

/** Dust progress at `age` ticks after the strike: `t` 0..1 (grows), `alpha` 1..0 (fades); null once over or before. Reduced motion holds `t` at 1 (a still ring that only fades). Pure. */
export function dustLook(age: number, reduced: boolean): { t: number; alpha: number } | null {
  if (age < 0 || age >= DUST_TICKS) return null;
  const p = age / DUST_TICKS;
  return { t: reduced ? 1 : 1 - (1 - p) * (1 - p), alpha: 1 - p };
}

/** Eight compass steps (no trig) used for the rockfall dust puffs and debris. */
const DUST_DIRS: readonly (readonly [number, number])[] = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];

/** Bright warning core per hazard kind (index 0 unused): white-hot on lava, plain white on stone. The fire and earth warn marks sit on this over a dark rim. */
export const WARN_CORE: readonly number[] = [0xffffff, 0xfff4e6, 0xbfe4f2, 0xffffff, 0xf2f6f8];

/** Alpha of a warn glyph: never below 0.6 so the blink dip (outline alpha 0.19 at worst) cannot make it fade into the floor. */
export function dangerGlyphAlpha(alpha: number): number {
  return 0.6 + 0.4 * Math.min(1, alpha / 0.8);
}

/** Y positions of a column of marks `gap` apart inside [top, top + h), scrolled by `shift` (wraps within one gap; fixed when 0). */
export function columnMarks(top: number, h: number, gap: number, shift: number): number[] {
  const out: number[] = [];
  if (gap <= 0) return out;
  for (let cy = top + (((shift % gap) + gap) % gap); cy < top + h; cy += gap) out.push(cy);
  return out;
}

/** Hot amber-red of the rockfall ground warning (distinct from the lava orange). */
export const EARTH_WARN = 0xff5a1f;

/** Rockfall ground pulse alpha 0.5..1 (a triangle wave, 24 ticks = about 2 Hz at 50 Hz, under the 3 flashes a second limit); steady 0.75 under reduced motion. Pure. */
export function earthPulse(tick: number, reduced: boolean): number {
  if (reduced) return 0.75;
  const ph = (tick % 24) / 24;
  return 0.5 + 0.5 * (ph < 0.5 ? ph * 2 : 2 - ph * 2);
}

const ROCK_CHEVRON_STYLE = [[8, 0x0a0806, 0.7], [4, 0xffd9b0, 0.9]] as const;

/** A row of 5 big (28 px) falling-rock chevrons centred on `cx` over `span` px at `y`, dark rim under an amber-white core; `drop` slides them down 0..23 px. Returns 5. */
function rockChevrons(g: Gfx, cx: number, y: number, span: number, pa: number, drop: number): number {
  const arm = 14;
  for (const [lw, c, a] of ROCK_CHEVRON_STYLE) {
    g.lineStyle(lw, c, a * Math.max(0.9, pa));
    for (let i = 0; i < 5; i++) {
      const mx = cx - span / 2 + (span * i) / 4;
      g.lineBetween(mx - arm, y + drop - arm * 0.6, mx, y + drop + arm * 0.6).lineBetween(mx, y + drop + arm * 0.6, mx + arm, y + drop - arm * 0.6);
    }
  }
  return 5;
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

/** A column of ^ (`up`) or v marks at `xc` inside [y, y + h): dark rim under a bright core, scrolling via `shift`; returns how many. */
function vChevrons(g: Gfx, xc: number, y: number, h: number, up: boolean, shift: number, core: number, alpha: number): number {
  const arm = 12;
  const ys = columnMarks(y + arm, h - 2 * arm, 64, shift);
  const d = up ? -1 : 1;
  for (const [lw, c, a] of [[9, 0x0a0806, 0.5 * alpha], [5, core, 0.9 * alpha]] as const) {
    g.lineStyle(lw, c, a);
    for (const cy of ys) g.lineBetween(xc - arm, cy - d * arm * 0.6, xc, cy + d * arm * 0.6).lineBetween(xc, cy + d * arm * 0.6, xc + arm, cy - d * arm * 0.6);
  }
  return ys.length;
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

  let text: Phaser.GameObjects.Text | undefined;
  /** The warning chip: the hazard word and seconds left, centred just above the box but kept inside the camera view (empty text hides it). */
  const chip = (label: string, x: number, y: number, w: number, alpha: number): void => {
    if (label === '' && !text) return;
    text ??= arena.add
      .text(0, 0, '', { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '26px', fontStyle: 'bold', color: '#f4ead2', stroke: '#0a0806', strokeThickness: 5, backgroundColor: '#0a0806c0', padding: { x: 10, y: 4 }, resolution: resolutionOf(arena) })
      .setOrigin(0.5, 0.5)
      .setDepth(CHIP_DEPTH);
    text.setVisible(label !== '');
    if (label === '') return;
    const v = arena.cameras.main.worldView;
    text.setText(label).setAlpha(Math.max(0.85, alpha));
    const cx = Math.min(v.x + v.width - text.width / 2 - 8, Math.max(v.x + text.width / 2 + 8, x + w / 2));
    // Camera zoom includes the render resolution (the arena's own framing zoom is zoom / resolution); the HUD strip is in logical px.
    const zoom = (arena.cameras.main.zoom || 1) / (resolutionOf(arena) || 1);
    const cy = Math.min(v.y + v.height - 24, Math.max(v.y + CHIP_MIN_SCREEN_Y / zoom, y - 24));
    text.setPosition(cx, cy);
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
      chip('', 0, 0, 0, 0);
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
      if (lane) g.fillStyle(col, 0.3 * alpha).fillRect(x, y, w, h);
      const gale = kind === 4;
      g.lineStyle(6, 0x0a0806, (gale ? 0.25 : 0.5) * alpha).strokeRect(x, y, w, h);
      // qa-r33: the gale's near-white outline and edge bars are the full-width rails that cut across fighters, so they fade to the chevron alpha.
      g.lineStyle(gale ? 2 : 3, lane ? light : col, (gale ? 0.3 : 1) * alpha).strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      if (lane) {
        // Tide and gust (r20): bright edge bars, big edge arrows and the chevrons, all steady under reduced motion.
        g.fillStyle(light, (gale ? 0.2 : 0.6) * alpha).fillRect(x, y, w, gale ? 2 : 5).fillRect(x, y + h - (gale ? 2 : 5), w, gale ? 2 : 5);
        glow.fillStyle(light, (gale ? 0.04 : 0.08) * alpha).fillRect(x, y, w, h);
        tideCountdown(g, x, y, w, h, dir, warnProgress(warnLeft, warnTotal), light, alpha);
        const shift = chevronShift(tick, dir, 72, reduced);
        edgeArrows(g, x, y, w, h, dir, light, gale ? 0.75 * alpha : alpha, gale);
        drawn = chevrons(g, x, y, w, h, dir, shift, light, (gale ? 0.32 : 0.5) * alpha, false);
      } else {
        // Fire and earth warnings (r21): the fire tint firms with the countdown, the earth ring grows with it, so neither reads as a thin outline on a busy floor.
        const pr = warnProgress(warnLeft, warnTotal);
        if (kind === 1) {
          const core = WARN_CORE[kind] ?? 0xffffff;
          const ga = dangerGlyphAlpha(alpha);
          // The chevrons point up, so they scroll up (dir -1).
          const shift = chevronShift(tick, -1, 64, reduced);
          g.fillStyle(0x3a0c06, (0.3 + 0.3 * pr) * alpha).fillRect(x, y, w, h);
          // Dark rim under white-hot bars and two columns of rising chevrons: the lava lane reads as danger, not decoration.
          for (const [lw, c, a] of [[9, 0x0a0806, 0.5 * ga], [4, core, 0.9 * ga]] as const) g.lineStyle(lw, c, a).strokeRect(x + 4, y + 4, w - 8, h - 8);
          g.fillStyle(0x0a0806, 0.5 * alpha).fillRect(x + w / 2 - 6, y + 10, 12, h - 20);
          g.fillStyle(core, 0.9 * ga).fillRect(x + w / 2 - 4, y + h - 10 - (h - 20) * pr, 8, (h - 20) * pr);
          drawn = vChevrons(g, x + w * 0.25, y, h, true, shift, core, Math.min(1, ga * 1.1)) + vChevrons(g, x + w * 0.75, y, h, true, shift + 32, core, Math.min(1, ga * 1.1));
          // A lane that runs off the camera edge: chevrons on the border point at the hidden part (steady, so safe under reduced motion).
          const cam = arena.cameras.main.worldView;
          for (const cue of edgeCues(cam, { x, y, w, h })) edgeChevron(g, cam, cue, core, Math.max(alpha, 0.8));
        } else {
          // Earth (art-director): the warning lies on the ground, never over the fighter: a hot amber-red disc and ring about 1.6x the
          // fighter's width on the floor line, pulsing 0.5..1 at about 2 Hz, with large falling-rock chevrons above the fighter's head (the sprite is taller than the box, so 100 px above the box top).
          const pa = earthPulse(tick, reduced);
          const cx = x + w / 2;
          const cy = y + h - 10;
          const rw = w * 1.6 * (0.85 + 0.15 * pr); // the ring closes in on its full size as the strike nears (time-to-impact cue)
          const rh = rw * 0.34;
          g.fillStyle(EARTH_WARN, 0.25 * pa).fillEllipse(cx, cy, rw, rh);
          g.lineStyle(9, 0x0a0806, 0.7 * pa).strokeEllipse(cx, cy, rw, rh);
          g.lineStyle(3, EARTH_WARN, pa).strokeEllipse(cx, cy, rw, rh);
          drawn = rockChevrons(g, cx, y - 100, rw * 0.8, pa, reduced ? 0 : tick % 24);
          const cam = arena.cameras.main.worldView;
          for (const cue of edgeCues(cam, { x, y, w, h })) edgeChevron(g, cam, cue, EARTH_WARN, Math.max(alpha, 0.8));
        }
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
        // r30: as strong as the telegraph. Decorative only (outside the sim box): a wide heat bloom, ember tongues up the lane
        // (still under reduced motion) and a warm screen-edge tint, so the strike reads at a glance on phone too.
        glow.fillStyle(col, 0.14 * alpha).fillRect(x - 36, y - 10, w + 72, h + 20);
        const rise = reduced ? 0 : (tick * 3) % 90;
        for (let ey = y + h - rise; ey > y - 90; ey -= 90) {
          for (const [ex, er] of [[x + w * 0.25, 7], [x + w * 0.75, 6], [x + w * 0.5, 9]] as const) {
            const py = ey - ((ex * 7) % 40);
            if (py < y - 20 || py > y + h) continue;
            glow.fillStyle(0xffd890, 0.7 * alpha).fillCircle(ex, py, er);
            g.fillStyle(0x3a0c06, 0.6 * alpha).fillCircle(ex, py, er * 0.5);
          }
        }
        const cv = arena.cameras.main.worldView;
        glow.fillStyle(col, 0.06 * alpha).fillRect(cv.x, cv.y, cv.width, cv.height);
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
        // qa-r32: the gale's light is near-white, so its lane edges are thin and dim (a hard white line crossed the fighters); the tide keeps its brighter bars.
        const edge = kind === 4 ? 2 : 3;
        g.fillStyle(light, (kind === 4 ? 0.22 : 0.4) * alpha).fillRect(x, y, w, edge).fillRect(x, y + h - edge, w, edge);
        glow.fillStyle(light, (kind === 4 ? 0.06 : 0.1) * alpha).fillRect(x, y, w, h);
        // r30/r31: quiet chevrons (alpha 0.22, no streaks, no halo) and a thin edge bar, so a full-field tide reads as one wash behind the fighters, not a grid over them.
        drawn = chevrons(g, x, y, w, h, dir, chevronShift(tick, dir, 72, reduced), light, 0.22 * alpha, false);
      }
    }
    const flash = warnLeft > 0 ? 0 : impactFlash(tick - strikeTick);
    // The strike flash is an outline plus a soft round burst (never a filled box: a pale rectangle round the fighter read as a render bug).
    if (flash > 0) {
      glow.lineStyle(kind === 4 ? 2 : 6, 0xffffff, kind === 4 ? flash * 0.15 : flash).strokeRect(x, y, w, h);
      if (kind === 3) glow.fillStyle(0xf0e4c8, flash * 0.5).fillCircle(x + w / 2, y + h / 2, Math.min(w, h) * 0.3);
    }
    const dust = kind === 3 && warnLeft <= 0 ? dustLook(tick - strikeTick, reduced) : null;
    if (dust) {
      // Rockfall impact: an expanding dust ring on the ground, soft puffs rolling out and angular debris thrown up (still, only fading, under reduced motion).
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = (w * 0.5 + 40) * (0.35 + 0.65 * dust.t);
      const ry = (h * 0.28 + 16) * (0.35 + 0.65 * dust.t);
      g.fillStyle(0x6a5236, 0.3 * dust.alpha).fillEllipse(cx, y + h - 6, rx * 2, ry * 2);
      g.lineStyle(6, 0x3a2c1e, 0.55 * dust.alpha).strokeEllipse(cx, y + h - 6, rx * 2, ry * 2);
      g.lineStyle(3, 0xf4e8c8, 0.9 * dust.alpha).strokeEllipse(cx, y + h - 6, rx * 2, ry * 2);
      for (let i = 0; i < 8; i++) {
        const [dx = 0, dy = 0] = DUST_DIRS[i] ?? [];
        const spread = (0.4 + 0.6 * dust.t) * (w * 0.5 + 30);
        const px = cx + dx * spread;
        const py = y + h - 10 + dy * 14 * dust.t;
        g.fillStyle(0x8a7050, 0.38 * dust.alpha).fillCircle(px, py, 18 + 16 * dust.t);
        const lift = (1 - (2 * dust.t - 1) * (2 * dust.t - 1)) * (48 + (i % 3) * 20);
        const dxp = cx + dx * (24 + 90 * dust.t) * (1 + (i % 2) * 0.3);
        const dyp = cy - lift * (i % 2 === 0 ? 1 : 0.6);
        const sz = 11 + (i % 3) * 5;
        g.fillStyle(0x3a2c1e, dust.alpha).fillTriangle(dxp - sz, dyp + sz, dxp + sz, dyp + sz * 0.6, dxp - sz * 0.2, dyp - sz);
        g.fillStyle(0xb08a5a, dust.alpha).fillTriangle(dxp - sz * 0.5, dyp + sz * 0.5, dxp + sz * 0.5, dyp + sz * 0.3, dxp - sz * 0.1, dyp - sz * 0.6);
      }
      glow.fillStyle(0xf0e4c8, 0.18 * dust.alpha).fillCircle(cx, cy, Math.min(w, h) * 0.45);
    }
    if (kind === 3 && warnLeft <= 0 && tick === strikeTick && !reduced) arena.cameras.main.shake(140, 0.004);
    // The rockfall chip rides the stage-edge band like TIDE and GUST (the clamp), so it never covers the ground marks.
    chip(warnLeft > 0 ? hazardLabel(kind, warnLeft) : '', x, kind === 3 ? -1e6 : y, w, alpha);
    markers.push({ kind, phase: warnLeft > 0 ? 'warn' : 'active', x, y, w, h, dir, alpha, chevrons: drawn, label: warnLeft > 0 ? hazardLabel(kind, warnLeft) : '' });
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    parts?.g.destroy();
    parts?.glow.destroy();
    text?.destroy();
    text = undefined;
    parts = undefined;
    live?.remove();
    live = undefined;
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => markers);
}
