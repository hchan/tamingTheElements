import type Phaser from 'phaser';
import { WEATHER_CHARGE_FULL, arcadePlayfield, type RenderView, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import { LOGICAL_WIDTH } from '../boot/viewport';
import { mountTagView } from '../hud/tag-view';
import { mute } from './grim-fx';
import {
  CALL_TICKS, MAX_PARTICLES, PARTICLE_COUNTS, SKY_TINTS, TICK_MS, WEATHER_COLORS, WEATHER_NAMES, WeatherFx,
  badgeFill, badgeLabel, callAlpha, callScale, chargeFill, chargeLabel, particle, progress, readyAlpha, tintAlpha, type Particle,
} from './weather-fx';

/**
 * Phaser side of the Arcade weather view (WP-arcade-weather-view, FUN-DESIGN 2.14 and section 3): a light sky tint and a
 * few particles per weather in the Arena (sun rays, rain streaks, sand, wind streaks, the eclipse dim and motes), and in
 * the Hud scene (so the Arena camera's shake and super punch-in never move them) a badge under the round pips (glyph,
 * word, seconds left and a notched time bar) and the called line ("Sunshine!"). The round view
 * (`hud/round-view.ts`, loaded by the Arena only in an Arcade match) mounts it and feeds it each tick's events; it is
 * its own chunk `weather-view` (vite.config.ts), so Classic never downloads it. The badge, tint and particles follow
 * `RenderView.arcade().weather` (so a replay or a late mount shows the weather up); the called line and the live-region
 * lines follow the events. Per match, on first use: two Arena Graphics, one Hud Graphics and two Hud Texts, reused; the
 * particles are computed into one reused object and drawn into a Graphics, so nothing allocates per frame. One Arena
 * `postupdate` listener; everything goes with the Arena or the Hud (shutdown or destroy).
 */

/** Tint over the background (-1), under the trails (-0.5) and the fighters (0); particles over the fighters, under the shields (3). */
const SKY_DEPTH = -0.75;
const FALL_DEPTH = 2;
/** Over the HUD (100-102), like the round banners (110). */
const HUD_DEPTH = 110;
/** LOGICAL_HEIGHT (boot/viewport.ts), kept here so the phaser-config chunk need not export it. */
const ARENA_H = 720;
/**
 * Badge: centred under the hyper meters (y 124 to 134), which leave too narrow a gap between them for a phone-sized
 * label (in 2v2 the meters start 80 px nearer the centre).
 */
const BADGE_X = LOGICAL_WIDTH / 2;
const BADGE_Y = 146;
const LABEL_PX = 28;
const GLYPH = 26;
const BAR_H = 6;
/** Time-bar notches every 2 s: the bar reads by its length and pattern, not colour. */
const NOTCHES = 5;
/**
 * Weather-charge chip (WP-arcade-weather-charge): team 0's charge ("WEATHER 60%" and a bar notched in quarters, or
 * "WEATHER READY" with a blinking border) always shown, centred under the badge's slot.
 */
const CHARGE_Y = 200;
const CHARGE_PX = 18;
const CHARGE_BAR_W = 200;
/** The called line: below the charge chip (its bar ends near y 246), clear of the round banners (y 320). */
const CALL_Y = 270;
const CALL_PX = 30;

export interface WeatherPrefs {
  readonly reduceMotion: boolean;
  readonly highContrast: boolean;
}

/** Read-out for the test probe. */
export interface WeatherState {
  /** The weather drawn (a `Weather` kind, 0 none), its badge text and time-bar fill (px). */
  readonly kind: number;
  readonly label: string;
  readonly fill: number;
  /** Sky tint alpha and the particles drawn on the last frame. */
  readonly tint: number;
  readonly particles: number;
  /** The charge chip: team 0's charge (per mille), its text and the bar fill (px). */
  readonly charge: number;
  readonly chargeText: string;
  readonly chargeFill: number;
  /** The called line while it shows ('' otherwise) and its scale. */
  readonly call: string;
  readonly callScale: number;
}

const states = new WeakMap<Phaser.Scene, () => WeatherState>();

/** The weather view's last frame in `arena` (test probe), or undefined before it mounts or after teardown. */
export function weatherState(arena: Phaser.Scene): WeatherState | undefined {
  return states.get(arena)?.();
}

/**
 * Mounts the weather view (Arena `arena`, HUD `hud`) for `view` and returns the event consumer the round view feeds every
 * tick, which passes the events on to `then` (the defence view's consumer, so the round view holds one). `say` is the
 * Arena's throttled live region; `prefs` the accessibility prefs (read on weather events and once a second).
 */
export function mountWeatherView(
  arena: Phaser.Scene,
  hud: Phaser.Scene,
  view: RenderView,
  say: (line: Announcement) => void,
  prefs: () => WeatherPrefs,
  then?: (events: readonly SimEvent[]) => void,
): (events: readonly SimEvent[]) => void {
  // The tag-team view (WP-arcade-tag-view, its own chunk) rides on this one: it builds nothing in 1v1.
  then = mountTagView(arena, hud, view, say, prefs, then);
  let reduced = prefs().reduceMotion;
  let highContrast = prefs().highContrast;
  let parts:
    | {
      sky: Phaser.GameObjects.Graphics; fall: Phaser.GameObjects.Graphics; badge: Phaser.GameObjects.Graphics;
      label: Phaser.GameObjects.Text; call: Phaser.GameObjects.Text;
      bar: Phaser.GameObjects.Graphics; chip: Phaser.GameObjects.Text;
    }
    | undefined;

  // View time: the view tick plus the frame time since it changed (capped below one tick, so it holds while paused).
  let tick = view.tick;
  let drawnTick = tick;
  let sub = 0;
  const now = (): number => tick + sub / TICK_MS;

  /** View tick of the last cast that changed the weather (the tint fades in from it); -Infinity: up before we mounted. */
  let startedAt = Number.NEGATIVE_INFINITY;
  let callFrom = Number.NEGATIVE_INFINITY;
  let callReduced = false;
  const drawn = { kind: 0, label: '', fill: -1, tint: 0, particles: 0, scale: 1, charge: -1, chargeText: '', chargeFill: 0, ready: 1 };
  const pt: Particle = { x: 0, y: 0, dx: 0, dy: 0, r: 0, a: 0 };

  const text = (px: number, stroke: number): Phaser.GameObjects.Text =>
    hud.add
      .text(0, 0, '', {
        fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${String(px)}px`, fontStyle: 'normal', color: '#cfc8b8', stroke: '#0a0806', strokeThickness: stroke,
        resolution: hud.scale.width / LOGICAL_WIDTH,
      })
      .setDepth(HUD_DEPTH)
      .setVisible(false);

  /** The objects, made on the first frame the Hud runs. */
  const made = (): NonNullable<typeof parts> => {
    parts ??= {
      sky: arena.add.graphics().setDepth(SKY_DEPTH),
      fall: arena.add.graphics().setDepth(FALL_DEPTH),
      badge: hud.add.graphics().setDepth(HUD_DEPTH),
      // Up to 1.4x on a phone (as `phoneBoost` in boot/viewport.ts), so the label stays near 12 CSS px.
      label: text(Math.round(LABEL_PX * Math.min(1.4, Math.max(1, 900 / (hud.scale.displaySize.width || 900)))), 5).setOrigin(0, 0),
      call: text(CALL_PX, 5).setOrigin(0.5),
      bar: hud.add.graphics().setDepth(HUD_DEPTH),
      chip: text(CHARGE_PX, 4).setOrigin(0.5, 0).setVisible(true),
    };
    return parts;
  };

  const fx = new WeatherFx(
    {
      start(): void {
        startedAt = now();
        made();
      },
      call(kind, flat): void {
        const c = made().call;
        c.setText(`${WEATHER_NAMES[kind - 1] ?? ''}!`).setColor(hex(mute(WEATHER_COLORS[kind - 1] ?? 0xffffff, 0.4, 0.75))).setVisible(true);
        callFrom = now();
        callReduced = flat;
      },
      end(): void {
        startedAt = Number.NEGATIVE_INFINITY;
      },
      say,
    },
    () => prefs().reduceMotion,
  );

  /** A dark ash plate with a thin worn edge (a squared slab, not a rounded pill); opaque in high contrast. */
  const plate = (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void => {
    g.fillStyle(0x0f0d0b, highContrast ? 0.9 : 0.68).fillRect(x, y, w, h);
    g.lineStyle(1, highContrast ? 0xffffff : 0x4a4235, highContrast ? 1 : 0.7).strokeRect(x, y, w, h);
  };

  /** The badge: a dark plate, the weather's glyph, its word and seconds, and the notched time bar under them. */
  const drawBadge = (p: NonNullable<typeof parts>, kind: number, left: number): void => {
    const label = badgeLabel(kind, left);
    if (label !== drawn.label) p.label.setText(label).setVisible(true);
    const w = GLYPH + 8 + p.label.width;
    const x = BADGE_X - w / 2;
    const fill = badgeFill(left, w);
    if (label === drawn.label && kind === drawn.kind && fill === drawn.fill) return;
    drawn.label = label;
    drawn.fill = fill;
    const h = p.label.height;
    const color = highContrast ? (WEATHER_COLORS[kind - 1] ?? 0xffffff) : mute(WEATHER_COLORS[kind - 1] ?? 0xffffff, 0.55, 0.85);
    p.label.setPosition(x + GLYPH + 8, BADGE_Y);
    const g = p.badge.clear();
    plate(g, x - 8, BADGE_Y - 4, w + 16, h + BAR_H + 12);
    glyph(g, kind, x + GLYPH / 2, BADGE_Y + h / 2, color);
    const by = BADGE_Y + h + 2;
    g.fillStyle(0x000000, 0.8).fillRect(x, by, w, BAR_H);
    g.fillStyle(color, 1).fillRect(x, by, fill, BAR_H);
    g.lineStyle(highContrast ? 2 : 1, highContrast ? 0xffffff : 0x000000, 1).strokeRect(x, by, w, BAR_H);
    for (let q = 1; q < NOTCHES; q++) g.lineBetween(x + (q * w) / NOTCHES, by, x + (q * w) / NOTCHES, by + BAR_H);
  };

  /** The charge chip: its text, then a plate, the bar (notched in quarters) and, ready, a blinking border. */
  const drawCharge = (p: NonNullable<typeof parts>, pm: number, clock: number): void => {
    const ready = pm >= WEATHER_CHARGE_FULL;
    const alpha = ready ? readyAlpha(clock, reduced) : 1;
    if (pm === drawn.charge && alpha === drawn.ready) return;
    drawn.charge = pm;
    drawn.ready = alpha;
    const label = chargeLabel(pm);
    if (label !== drawn.chargeText) p.chip.setText(label);
    drawn.chargeText = label;
    drawn.chargeFill = chargeFill(pm, CHARGE_BAR_W);
    const x = BADGE_X - CHARGE_BAR_W / 2;
    p.chip.setPosition(BADGE_X, CHARGE_Y);
    const by = CHARGE_Y + p.chip.height + 2;
    const g = p.bar.clear();
    plate(g, x - 8, CHARGE_Y - 4, CHARGE_BAR_W + 16, p.chip.height + BAR_H + 12);
    g.fillStyle(0x000000, 0.8).fillRect(x, by, CHARGE_BAR_W, BAR_H);
    g.fillStyle(ready ? 0xb39653 : 0x6f8796, 1).fillRect(x, by, drawn.chargeFill, BAR_H);
    g.lineStyle(highContrast || ready ? 2 : 1, highContrast || ready ? 0xffffff : 0x000000, alpha).strokeRect(x, by, CHARGE_BAR_W, BAR_H);
    for (let q = 1; q < 4; q++) g.lineBetween(x + (q * CHARGE_BAR_W) / 4, by, x + (q * CHARGE_BAR_W) / 4, by + BAR_H);
  };

  function draw(_time: number, delta: number): void {
    if (drawnTick !== tick) sub = 0;
    else sub = Math.min(TICK_MS - 1, sub + delta);
    drawnTick = tick;
    // The objects are made on the first frame the Hud runs (the chip shows from then on, with or without a weather).
    const p = parts ?? (hud.sys.isActive() ? made() : undefined);
    if (!p) return;
    const clock = now();
    // The super banner's high band covers the badge, chip and called line: hide them while it runs (alpha, so the draw caches hold).
    const a = hud.registry.get('tte.band') === true ? 0 : 1;
    for (const o of [p.badge, p.label, p.call, p.bar, p.chip]) o.setAlpha(a);
    const ar = view.arcade();
    const kind = ar?.weather ?? 0;
    const left = ar?.weatherLeft ?? 0;
    drawCharge(p, ar?.weatherCharge[0] ?? 0, clock);
    // The called line, timed on the view tick.
    if (p.call.visible) {
      const c = progress(clock, callFrom, CALL_TICKS);
      drawn.scale = callScale(c, callReduced);
      if (c >= 1) p.call.setVisible(false);
      else p.call.setPosition(BADGE_X, CALL_Y).setScale(drawn.scale).setAlpha(a * 0.85 * callAlpha(c));
    }
    if (kind === 0) {
      if (drawn.kind !== 0) {
        p.sky.clear();
        p.fall.clear();
        p.badge.clear();
        p.label.setVisible(false);
        Object.assign(drawn, { kind: 0, label: '', fill: -1, tint: 0, particles: 0 });
      }
      return;
    }
    drawBadge(p, kind, left);
    drawn.kind = kind;
    const tint = SKY_TINTS[kind - 1] ?? SKY_TINTS[0];
    drawn.tint = tintAlpha(kind, clock - startedAt, left, reduced);
    p.sky.clear().fillStyle(tint[0], drawn.tint).fillRect(0, 0, arcadePlayfield().w, ARENA_H);
    // Particles are motion only: none with reduced motion (the tint, badge and line carry the information).
    const fall = p.fall.clear();
    const n = reduced ? 0 : Math.min(MAX_PARTICLES, PARTICLE_COUNTS[kind - 1] ?? 0);
    const color = WEATHER_COLORS[kind - 1] ?? 0xffffff;
    const fade = drawn.tint / tint[1];
    for (let i = 0; i < n; i++) {
      particle(kind, i, clock, pt);
      if (kind === 1) {
        // A sun ray: a wedge from the corner, widening to `r` at its far end.
        const len = Math.hypot(pt.dx, pt.dy) || 1;
        const nx = (-pt.dy / len) * pt.r;
        const ny = (pt.dx / len) * pt.r;
        fall.fillStyle(0xfff2b0, pt.a * fade).fillTriangle(pt.x, pt.y, pt.x + pt.dx + nx, pt.y + pt.dy + ny, pt.x + pt.dx - nx, pt.y + pt.dy - ny);
      } else if (pt.r > 0) {
        // A dark rim, then the grain or mote: readable on light and dark arenas alike.
        fall.fillStyle(0x000000, pt.a * fade * 0.22).fillCircle(pt.x, pt.y, pt.r + 2);
        fall.fillStyle(kind === 5 ? 0x3a1f66 : mute(color), pt.a * fade * 0.8).fillCircle(pt.x, pt.y, pt.r);
      } else {
        fall.lineStyle(4, 0x000000, pt.a * fade * 0.15).lineBetween(pt.x, pt.y, pt.x + pt.dx, pt.y + pt.dy);
        fall.lineStyle(1.5, mute(color), pt.a * fade * 0.8).lineBetween(pt.x, pt.y, pt.x + pt.dx, pt.y + pt.dy);
      }
    }
    drawn.particles = n;
  }

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    hud.events.off('shutdown', off).off('destroy', off);
    states.delete(arena);
    if (parts) for (const o of Object.values(parts)) o.destroy();
    parts = undefined;
  };
  arena.events.on('postupdate', draw);
  for (const s of [arena, hud]) s.events.once('shutdown', off).once('destroy', off);
  // A weather already up when the view mounts (a replay seeking, or a slow chunk) shows at once, with no called line.
  states.set(arena, () => ({
    kind: drawn.kind, label: drawn.label, fill: Math.max(0, drawn.fill), tint: drawn.tint, particles: drawn.particles,
    charge: Math.max(0, drawn.charge), chargeText: drawn.chargeText, chargeFill: drawn.chargeFill,
    call: parts?.call.visible ? parts.call.text : '', callScale: drawn.scale,
  }));
  return (events) => {
    tick = view.tick;
    sub = 0;
    if (tick % 50 === 0) {
      const p = prefs();
      reduced = p.reduceMotion;
      highContrast = p.highContrast;
    }
    fx.consume(events);
    then?.(events);
  };
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * The weather's glyph in a GLYPH box centred on (x, y): a sun with rays, three rain drops, blown sand lines and grains,
 * three wind lines, an eclipsed sun (a dark disc in a bright ring). Shape, not colour, tells them apart.
 */
function glyph(g: Phaser.GameObjects.Graphics, kind: number, x: number, y: number, color: number): void {
  const r = GLYPH / 2;
  switch (kind) {
    case 1:
      g.fillStyle(color, 1).fillCircle(x, y, r * 0.5);
      g.lineStyle(3, color, 1);
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        g.lineBetween(x + Math.cos(a) * r * 0.68, y + Math.sin(a) * r * 0.68, x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      break;
    case 2:
      g.fillStyle(color, 1);
      for (const [dx, dy] of [[-0.55, -0.2], [0.05, 0.25], [0.6, -0.25]] as const) {
        const cx = x + dx * r;
        const cy = y + dy * r;
        g.fillTriangle(cx, cy - r * 0.6, cx - r * 0.25, cy, cx + r * 0.25, cy).fillCircle(cx, cy, r * 0.25);
      }
      break;
    case 3:
      g.lineStyle(3, color, 1);
      for (let k = -1; k <= 1; k++) g.lineBetween(x - r, y + k * r * 0.6, x + r * (0.4 - 0.3 * k), y + k * r * 0.6);
      g.fillStyle(color, 1).fillCircle(x + r * 0.8, y - r * 0.3, 2).fillCircle(x + r * 0.9, y + r * 0.3, 2);
      break;
    case 4:
      g.lineStyle(3, color, 1);
      for (let k = -1; k <= 1; k++) {
        const ly = y + k * r * 0.6;
        g.lineBetween(x - r, ly, x + r * (0.7 - 0.25 * Math.abs(k)), ly);
        g.strokeCircle(x + r * (0.7 - 0.25 * Math.abs(k)), ly - r * 0.2, r * 0.2);
      }
      break;
    default:
      g.fillStyle(color, 1).fillCircle(x, y, r);
      g.fillStyle(0x10061e, 1).fillCircle(x + r * 0.15, y, r * 0.78);
  }
}
