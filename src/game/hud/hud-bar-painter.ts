import type Phaser from 'phaser';
import { ELEMENT_COLORS } from '../fx/element-colors';
import { mute } from '../fx/grim-fx';
import { barGrain } from './hud-math';
import { lifeTicks, readyGlow, superRimLayers } from './arcade-hud';
import { MAX_COLOR, REST_COLOR, barFill, criticalPulse, dashSegments, grimHealthColor, healthCue, shade, type BarGeometry, type HudCharacter } from './bars';
import { LOW_FLASH_AT, TRAIL_COLOR, lifeFill, stepTrail, type Trail } from './slim-hud';
import type { HudFlags } from './hud-ctx';

/** Bar track and thin frame: ash-black, not pure black. */
const TRACK_COLOR = 0x120f0c;
const FRAME_COLOR = 0x050403;

/** Paints the HUD life bars: the slim Arcade bar, the Classic plate, the white chip-drain trail and the gold SUPER rim. Takes the scene (clock only) and the shared flags, never the Hud class. */
export class HudBarPainter {
  /** Arcade: the white chip-drain trail per hero id. */
  private readonly trails = new Map<number, Trail>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly flags: HudFlags,
  ) {}

  reset(): void {
    this.trails.clear();
  }

  /** The white chip-drain trail: the life just lost stays as a bright bar that holds, then drains to the current life. */
  drawTrail(gfx: Phaser.GameObjects.Graphics, g: BarGeometry, c: HudCharacter): void {
    const t = this.trails.get(c.id) ?? { v: c.hp, hold: 0 };
    this.trails.set(c.id, t);
    const v = stepTrail(t, c.hp, c.maxHp, this.flags.reduceMotion, this.flags.frameMs);
    if (c.dead || v <= c.hp || c.maxHp <= 0) return;
    const w = g.maxX - g.minX;
    const x0 = g.minX + Math.ceil(w * Math.max(0, c.hp) / c.maxHp);
    // At least 3 px, so a light chip (7 on a 571 bar) still reads.
    const x1 = Math.max(x0 + 3, g.minX + Math.ceil(w * Math.min(1, v / c.maxHp)));
    gfx.lineStyle(g.line, TRAIL_COLOR, 0.95).lineBetween(x0, g.y, x1, g.y);
    gfx.lineStyle(Math.max(2, Math.round(g.line / 3)), 0xfff3c4, 0.9).lineBetween(x0, g.y - g.line / 4, x1, g.y - g.line / 4);
  }

  /** A full SUPER rims the life bar in gold (steady edge, breathing halo; steady under reduced motion), matching the action-bar slot. */
  drawSuperRim(gfx: Phaser.GameObjects.Graphics, g: BarGeometry): void {
    const glow = this.flags.highContrast ? 0xffffff : 0xffe28a;
    const { steady, halo } = superRimLayers(readyGlow(this.scene.time.now, this.flags.reduceMotion));
    const w = g.maxX - g.minX;
    const h = g.lineMax;
    for (const l of halo) gfx.lineStyle(2, glow, l.alpha).strokeRect(g.minX - l.grow, g.y - h / 2 - l.grow, w + l.grow * 2, h + l.grow * 2);
    gfx.lineStyle(2, this.flags.highContrast ? 0xffffff : 0xffd966, steady.alpha).strokeRect(g.minX - steady.grow, g.y - h / 2 - steady.grow, w + steady.grow * 2, h + steady.grow * 2);
  }

  drawBar(gfx: Phaser.GameObjects.Graphics, g: BarGeometry, c: HudCharacter, main: boolean): void {
    if (!this.flags.arcade && !this.flags.highContrast) {
      this.drawClassicBar(gfx, g, c, main);
      return;
    }
    const stroke = (width: number, color: number, toX: number, alpha = 1): void => {
      gfx.lineStyle(width, color, alpha);
      gfx.lineBetween(g.minX, g.y, toX, g.y);
    };
    stroke(g.lineMax, this.flags.highContrast ? 0xffffff : TRACK_COLOR, g.maxX);
    if (this.flags.highContrast) stroke(g.lineMax - 2, MAX_COLOR, g.maxX);
    else this.thinFrame(gfx, g);
    if (c.dead) {
      this.drawTicks(gfx, g, c.maxHp, main);
      return;
    }
    const fill = barFill(g, c.hp, c.maxHp, c.restCap, this.flags.highContrast);
    const frac = c.maxHp > 0 ? c.hp / c.maxHp : 0;
    // Slim (Arcade) bars wear the hero's element colour and flash red when critical; the Classic high-contrast bar keeps its ramp.
    const color = this.flags.highContrast ? fill.color : this.flags.arcade ? lifeFill(mute(ELEMENT_COLORS[c.element], 0.7, 0.8), frac, frac <= LOW_FLASH_AT ? criticalPulse(this.scene.time.now, this.flags.reduceMotion) : 0) : grimHealthColor(frac);
    stroke(g.line, REST_COLOR, fill.restX, this.flags.highContrast ? 1 : 0.4);
    if (c.hp > 0) {
      // Pattern cue: solid when healthy, long dashes when hurt, short dashes when critical.
      const cue = healthCue(c.hp / Math.max(1, c.maxHp));
      gfx.lineStyle(g.line, color, 1);
      const segs = dashSegments(g.minX, fill.curX, cue.dash);
      for (const [x0, x1] of segs) gfx.lineBetween(x0, g.y, x1, g.y);
      if (!this.flags.highContrast) {
        // A lit top edge and a shaded foot give the fill depth, so a pale element (air, Cyclonius) is not one flat stripe.
        const top = g.y - g.line / 2 + 0.5;
        const foot = g.y + g.line / 2 - 0.5;
        for (const [x0, x1] of segs) {
          gfx.lineStyle(1, shade(color, 1.45), 0.7).lineBetween(x0, top, x1, top);
          gfx.lineStyle(1, shade(color, 0.55), 0.8).lineBetween(x0, foot, x1, foot);
        }
        this.grain(gfx, g, segs);
      }
    }
    this.drawTicks(gfx, g, c.maxHp, main);
  }

  /** The Life bar's notches every 100 HP across fill and track (Arcade main bars only; the bench chips are too small). Dark, so they never add colour. */
  private drawTicks(gfx: Phaser.GameObjects.Graphics, g: BarGeometry, maxHp: number, main: boolean): void {
    if (!this.flags.arcade || !main) return;
    const w = g.lineMax < 8 ? 1 : 2;
    gfx.lineStyle(w, 0x0a0806, this.flags.highContrast ? 0.8 : 0.45);
    for (const x of lifeTicks(maxHp, g.minX, g.maxX)) gfx.lineBetween(x, g.y - g.lineMax / 2, x, g.y + g.lineMax / 2);
  }

  /** An empty track with its notches: the main bar of a side with no active hero. */
  drawEmptyBar(gfx: Phaser.GameObjects.Graphics, g: BarGeometry, maxHp: number): void {
    gfx.lineStyle(g.lineMax, this.flags.highContrast ? 0xffffff : TRACK_COLOR, 1).lineBetween(g.minX, g.y, g.maxX, g.y);
    if (!this.flags.highContrast) this.thinFrame(gfx, g);
    this.drawTicks(gfx, g, maxHp, true);
  }

  /** A thin dark frame round the track (the grim replacement for a bold plate). */
  private thinFrame(gfx: Phaser.GameObjects.Graphics, g: BarGeometry): void {
    gfx.lineStyle(1, FRAME_COLOR, 0.9);
    gfx.strokeRect(g.minX - 0.5, g.y - g.lineMax / 2 - 0.5, g.maxX - g.minX + 1, g.lineMax + 1);
  }

  /** Speckle over the fill: dark and ash flecks from an integer hash of the x position (a still pattern: nothing flickers, nothing is random). */
  private grain(gfx: Phaser.GameObjects.Graphics, g: BarGeometry, segs: readonly (readonly [number, number])[]): void {
    for (const f of barGrain(g, segs)) gfx.fillStyle(f.color, f.alpha).fillRect(f.x, f.y, 2, 2);
  }

  /**
   * Classic bar: a dark rounded plate with an element-coloured edge, the legacy health/rest geometry inside (same dash
   * cues), a lit top edge on the fill, a pulsing red border when critical and a cross over a knocked-out teammate.
   */
  private drawClassicBar(gfx: Phaser.GameObjects.Graphics, g: BarGeometry, c: HudCharacter, main: boolean): void {
    const h = g.lineMax;
    const top = g.y - h / 2;
    const pad = main ? 3 : 2;
    const px = g.minX - pad;
    const pw = g.maxX - g.minX + pad * 2;
    const ph = h + pad * 2;
    const accent = ELEMENT_COLORS[c.element];
    const frac = c.maxHp > 0 ? c.hp / c.maxHp : 0;
    const critical = !c.dead && c.hp > 0 && healthCue(frac).state === 'critical';
    gfx.fillStyle(0x0b0a09, c.dead ? 0.45 : 0.82);
    gfx.fillRoundedRect(px, top - pad, pw, ph, 2);
    if (critical) {
      gfx.lineStyle(2, 0xb5301f, criticalPulse(this.scene.time.now, this.flags.reduceMotion));
      gfx.strokeRoundedRect(px, top - pad, pw, ph, 2);
    } else {
      gfx.lineStyle(1, shade(accent, 0.7), c.dead ? 0.25 : 0.7);
      gfx.strokeRoundedRect(px, top - pad, pw, ph, 2);
    }
    if (c.dead) {
      gfx.lineStyle(2, 0xa8402f, 0.7);
      const cx = g.minX + 7;
      gfx.lineBetween(cx - 4, g.y - 4, cx + 4, g.y + 4);
      gfx.lineBetween(cx - 4, g.y + 4, cx + 4, g.y - 4);
      return;
    }
    const fill = barFill(g, c.hp, c.maxHp, c.restCap, false);
    gfx.lineStyle(g.line, REST_COLOR, 0.35);
    gfx.lineBetween(g.minX, g.y, fill.restX, g.y);
    // Recovering ghost: the span between health and the rest cap that a benched teammate refills (pulsing light green while healing).
    if (c.benched && fill.restX > fill.curX && c.hp > 0) {
      const pulse = this.flags.reduceMotion ? 0.5 : criticalPulse(this.scene.time.now, false);
      gfx.lineStyle(g.line, 0x9fb58a, 0.25 + 0.3 * pulse);
      gfx.lineBetween(fill.curX, g.y, fill.restX, g.y);
    }
    if (c.hp <= 0) return;
    const cue = healthCue(frac);
    const segs = dashSegments(g.minX, fill.curX, cue.dash);
    const color = grimHealthColor(frac);
    gfx.lineStyle(g.line, color, 1);
    for (const [x0, x1] of segs) gfx.lineBetween(x0, g.y, x1, g.y);
    this.grain(gfx, g, segs);
  }
}
