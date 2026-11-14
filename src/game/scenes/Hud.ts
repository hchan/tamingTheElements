import Phaser from 'phaser';
import type { RenderView } from '@core/index';
import { ELEMENT_COLORS } from '../fx/element-colors';
import { mute } from '../fx/grim-fx';
import { ROOT_ICON, STATUS_LOOKS, StatusTracker, chipBlink, chipFlash, chipPop } from '../fx/status-fx';
import { crisp, fitScene, phoneBoost } from '../boot/viewport';
import { lookup } from '../views/projectile-view';
import { heroName } from '../hud/tag-fx';
import { elementMark } from '../hud/element-mark';
import { getPrefs } from '../platform/a11y/prefs';
import { BUFF_SLOT, collectBuffs } from '../hud/buffs';
import { CHIP_FONT, CHIP_MAX, CHIP_Y, collectStatusChips } from '../hud/status-icons';
import {
  CHARGE_DASH, METER_W, METER_Y, SEGMENT_H, SEGMENT_W, comboAlpha, comboLabel, comboScale, meterLabel, meterFlashAlpha,
  meterSegments, meterX, numberAlpha, numberLabel, numberRise, type ArcadeHudModel,
} from '../hud/arcade-hud';
import {
  HUD_WIDTH,
  MAX_COLOR,
  REST_COLOR,
  barFill,
  benchBar,
  collectSide,
  criticalPulse,
  grimHealthColor,
  shade,
  dashSegments,
  activeHeroText,
  healthCue,
  mainBar,
  regenLabel,
  regenState,
  sideOffset,
  type BarGeometry,
  type HudCharacter,
} from '../hud/bars';
import {
  CHIP_BOTTOM, SLIM_H, LOW_FLASH_AT, TRAIL_COLOR, chipBar, lifeFill, chipRect, compactLabel, slimBar, slimPortrait, stepTrail, SLIM_ROW_B, type Trail,
} from '../hud/slim-hud';
import { gradedHeroTexture } from '../fx/hero-grade';
import { PORTRAIT, PORTRAIT_Y, barGrain, benchPortraitRect, chipRowTop, comboKey, edgeGrainFlecks, portraitX, regenAnchor } from '../hud/hud-math';

export const HUD_SCENE = 'Hud';

export interface HudData {
  readonly view: RenderView;
  /** Arcade matches only: damage numbers and combo counters, fed and aged by the Arena. */
  readonly arcade?: ArcadeHudModel;
}

/** Combo counter anchor under each side's bars (logical px). */
const COMBO_Y = 110;
const COMBO_MARGIN = 24;
/** Hyper meter fill (high contrast: white) and the gap between the meter and its bar-count label. */
const METER_COLOR = 0x4fc3ff;
const METER_LABEL_GAP = 8;
/** Bar track and thin frame: ash-black, not pure black. */
const TRACK_COLOR = 0x120f0c;
const FRAME_COLOR = 0x050403;

const TEAMS = [0, 1] as const;

/** Where a status chip was and its colour, kept so the expire flash can outline it after it ends. */
interface ChipLook {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: number;
}
const PORTRAIT_FRAME = 'portrait';
/** The same already-installed engraved serif the action bar, timer and banners use (no new font files). */
const HUD_FONT = 'Georgia, "Times New Roman", serif';
/** Frames between re-reads of the accessibility prefs (the OS media queries are not free per frame). */
const PREFS_REFRESH_FRAMES = 30;

/**
 * Top HUD, a scene that runs in parallel with Arena. Each frame it reads the RenderView and redraws;
 * it holds no rules: it never kills a character or writes to the sim.
 */
export class Hud extends Phaser.Scene {
  private view: RenderView | undefined;
  private gfx: Phaser.GameObjects.Graphics | undefined;
  private labels: Phaser.GameObjects.Text[] = [];
  private back: Phaser.GameObjects.Graphics | undefined;
  private scrim: Phaser.GameObjects.Graphics | undefined;
  private portraits: Phaser.GameObjects.Image[] = [];
  /** Regen text per bench row, pooled: index team * 4 + row. */
  private regenTexts: (Phaser.GameObjects.Text | undefined)[] = [];
  private grainGfx: Phaser.GameObjects.Graphics | undefined;
  private highContrast = false;
  private reduceMotion = false;
  private chipTrackers: StatusTracker<ChipLook>[] = [];
  private frame = 0;
  private arcade: ArcadeHudModel | undefined;
  /** Pooled texts, created on first use: one per damage-number slot and one combo counter per team. */
  private numberTexts: (Phaser.GameObjects.Text | undefined)[] = [];
  private numberSerials: number[] = [];
  private comboTexts: (Phaser.GameObjects.Text | undefined)[] = [];
  private comboKeys: number[] = [];
  private meterTexts: (Phaser.GameObjects.Text | undefined)[] = [];
  /** Arcade status chip words, pooled per side: index team * CHIP_MAX + slot. */
  private chipTexts: (Phaser.GameObjects.Text | undefined)[] = [];
  /** Arcade: the white chip-drain trail per hero id. */
  private trails = new Map<number, Trail>();

  constructor() {
    super(HUD_SCENE);
  }

  init(data: HudData): void {
    this.view = data.view;
    this.arcade = data.arcade;
  }

  create(): void {
    fitScene(this);
    if (this.arcade) this.drawScrim();
    this.back = this.add.graphics().setDepth(98);
    this.gfx = this.add.graphics().setDepth(100);
    this.portraits = [...TEAMS, ...TEAMS.flatMap((t) => [t, t, t, t])].map(() => this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(99).setVisible(false));
    // One text per side next to the bar: health state in words, so it never depends on red versus green.
    // Larger on phones (the canvas is drawn about 0.3x there), wrapped to the free column left of the bench bars, and outlined so it
    // reads on bright arenas without touching the bars beside it.
    const boost = this.arcade ? Math.min(1.4, phoneBoost(this, 2)) : phoneBoost(this, 2);
    this.labels = TEAMS.map((team) =>
      this.add
        .text(
          this.arcade ? (team === 0 ? slimBar(0).minX : slimBar(1).maxX) : mainBar(sideOffset(team)).minX,
          this.arcade ? SLIM_ROW_B - 1 : 22,
          '',
          crisp(this, {
            fontFamily: HUD_FONT,
            fontSize: `${String(Math.round((this.arcade ? 14 : 16) * boost))}px`,
            color: '#e6dfd0',
            fontStyle: 'bold',
            stroke: '#0a0806',
            strokeThickness: 2,
            ...(this.arcade ? {} : { wordWrap: { width: 150 } }),
          }),
        )
        .setOrigin(this.arcade && team === 1 ? 1 : 0, 0)
        .setDepth(101),
    );
    this.refreshPrefs();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.removeAllListeners(Phaser.Scenes.Events.SHUTDOWN);
      this.gfx?.destroy();
      this.gfx = undefined;
      this.back?.destroy();
      this.back = undefined;
      this.scrim?.destroy();
      this.scrim = undefined;
      this.trails.clear();
      this.grainGfx?.destroy();
      this.grainGfx = undefined;
      for (const im of this.portraits) im.destroy();
      this.portraits = [];
      for (const t of [...this.labels, ...this.regenTexts, ...this.numberTexts, ...this.comboTexts, ...this.meterTexts, ...this.chipTexts]) t?.destroy();
      this.labels = [];
      this.regenTexts = [];
      this.numberTexts = [];
      this.numberSerials = [];
      this.comboTexts = [];
      this.comboKeys = [];
      this.meterTexts = [];
      this.chipTexts = [];
      this.view = undefined;
      this.arcade = undefined;
    });
  }

  /** Test hook: the words beside each side's main bar, as drawn. */
  heroLabels(): string[] {
    return this.labels.map((t) => t.text);
  }

  override update(): void {
    const { view, gfx } = this;
    if (!view || !gfx) return;
    gfx.clear();
    this.back?.clear();
    if (++this.frame % PREFS_REFRESH_FRAMES === 0) this.refreshPrefs();
    for (const team of TEAMS) {
      const side = collectSide(view, team);
      const x = sideOffset(team);
      const label = this.labels[team];
      if (side.active) {
        if (this.arcade) {
          this.drawBar(gfx, slimBar(team), side.active, true);
          this.drawTrail(gfx, slimBar(team), side.active);
          label?.setText(compactLabel(heroName(side.active.sprite), side.active));
        } else {
          this.drawBar(gfx, mainBar(x), side.active, true);
          label?.setText(activeHeroText(heroName(side.active.sprite), side.active, this.classic));
        }
        if (this.arcade) this.drawArcadeAvatar(gfx, team, side.active);
        else this.drawPortrait(gfx, team, side.active, side.bench);
        if (this.arcade) this.drawStatusChips(gfx, team, side.active, x, side.bench.length > 0);
        else this.drawLegacyBuffs(gfx, view, side.active, x);
      } else {
        label?.setText('');
        this.hideChips(team, 0);
        for (const i of [team, ...[0, 1, 2, 3].map((k) => TEAMS.length + team * 4 + k)]) this.portraits[i]?.setVisible(false);
      }
      side.bench.forEach((c, i) => {
        if (this.arcade) {
          this.drawChip(gfx, team, i, c);
          return;
        }
        this.drawBar(gfx, benchBar(x, i), c, false);
        if (this.classic) this.drawRegenText(team, i, c);
      });
      for (let i = side.bench.length; i < 4; i++) this.regenTexts[team * 4 + i]?.setVisible(false);
    }
    if (this.arcade) this.drawArcade(this.arcade);
  }

  /** Arcade: a dark top band over the crowd (the terrain owns it), fading out down to the floor. */
  private drawScrim(): void {
    const g = this.add.graphics().setDepth(96);
    g.fillStyle(0x14122a, 0.8).fillRect(0, 0, HUD_WIDTH, SLIM_H + 2);
    // Dense over the crowd band (about y 115-180), a short fade into the floor at about y 182.
    // Lighter and shorter than before: the crowd shows through under the HUD instead of a dead dark band.
    g.fillStyle(0x14122a, 0.38).fillRect(0, SLIM_H + 2, HUD_WIDTH, 100 - SLIM_H);
    for (let i = 0; i < 8; i++) g.fillStyle(0x14122a, 0.34 * (1 - i / 8)).fillRect(0, 100 + i * 8, HUD_WIDTH, 8);
    g.fillStyle(0x0a0818, 0.7).fillRect(0, SLIM_H + 1, HUD_WIDTH, 1);
    this.scrim = g;
  }

  /** The white chip-drain trail: the life just lost stays as a bright bar that holds, then drains to the current life. */
  private drawTrail(gfx: Phaser.GameObjects.Graphics, g: BarGeometry, c: HudCharacter): void {
    const t = this.trails.get(c.id) ?? { v: c.hp, hold: 0 };
    this.trails.set(c.id, t);
    const v = stepTrail(t, c.hp, c.maxHp, this.reduceMotion);
    if (c.dead || v <= c.hp || c.maxHp <= 0) return;
    const w = g.maxX - g.minX;
    const x0 = g.minX + Math.ceil(w * Math.max(0, c.hp) / c.maxHp);
    const x1 = g.minX + Math.ceil(w * Math.min(1, v / c.maxHp));
    gfx.lineStyle(g.line, TRAIL_COLOR, 0.95).lineBetween(x0, g.y, x1, g.y);
  }

  /** Arcade bench chip: a 56 px portrait with its element mark, a life bar under it, and a gold pulsing frame when a tag would work now (dimmed with a cross when down). */
  private drawChip(gfx: Phaser.GameObjects.Graphics, team: number, i: number, c: HudCharacter): void {
    const r = chipRect(team, i);
    this.back?.fillStyle(0x070a12, 0.85).fillRect(r.x - 2, r.y - 2, r.size + 4, r.size + 4);
    const im = this.portraits[TEAMS.length + team * 4 + i];
    this.placePortrait(im, c, r.x, r.y, r.size, team === 1);
    im?.setAlpha(c.dead ? 0.35 : 1);
    const bar = this.view?.actionBar(team);
    const ready = !c.dead && !!bar && bar.swapReadyTick <= bar.tick;
    const pulse = ready && !this.reduceMotion ? 0.6 + 0.4 * Math.abs(((this.frame % 60) - 30) / 30) : 1;
    gfx.lineStyle(this.highContrast || ready ? 3 : 2, c.dead ? 0x777777 : this.highContrast ? 0xffffff : ready ? 0xb39653 : mute(ELEMENT_COLORS[c.element], 0.55, 0.72), ready ? pulse : 0.95);
    gfx.strokeRect(r.x - 2, r.y - 2, r.size + 4, r.size + 4);
    this.drawMark(gfx, c.element, r.x + 8, r.y + r.size - 8, 4);
    if (c.dead) {
      gfx.lineStyle(3, 0xff5a4a, 1);
      gfx.lineBetween(r.x + 4, r.y + 4, r.x + r.size - 4, r.y + r.size - 4);
      gfx.lineBetween(r.x + 4, r.y + r.size - 4, r.x + r.size - 4, r.y + 4);
    }
    this.drawBar(gfx, chipBar(team, i), c, false);
  }

  /** Classic buffs: a row of plus or cross squares in the free column under the health words. */
  private drawLegacyBuffs(gfx: Phaser.GameObjects.Graphics, view: RenderView, c: HudCharacter, x: number): void {
    for (const b of collectBuffs(view, c.id, x, this.highContrast)) {
      gfx.lineStyle(this.highContrast ? 2 : 1, this.highContrast ? 0xffffff : 0x111111, 1);
      gfx.strokeRect(b.x, b.y, BUFF_SLOT, BUFF_SLOT);
      // Remaining-time fill: the slot drains as the status runs out.
      const remain = (1 - b.elapsed) * BUFF_SLOT;
      gfx.fillStyle(b.color, 1);
      gfx.fillRect(b.x, b.y + BUFF_SLOT - remain, BUFF_SLOT, remain);
      // Shape cue: a plus for a buff, a cross for a debuff.
      gfx.lineStyle(2, 0x000000, 1);
      const cx = b.x + BUFF_SLOT / 2;
      const cy = b.y + BUFF_SLOT / 2;
      const r = BUFF_SLOT / 4;
      if (b.glyph === 'plus') {
        gfx.lineBetween(cx - r, cy, cx + r, cy);
        gfx.lineBetween(cx, cy - r, cx, cy + r);
      } else {
        gfx.lineBetween(cx - r, cy - r, cx + r, cy + r);
        gfx.lineBetween(cx - r, cy + r, cx + r, cy - r);
      }
    }
  }

  /**
   * Arcade: one chip per active buff or debuff under the bar (shape, word and seconds; the bar under it drains), pooled texts.
   * The sim already exposes every status, so this only reads the view (`collectStatusChips`).
   */
  private drawStatusChips(gfx: Phaser.GameObjects.Graphics, team: number, c: HudCharacter, x: number, benched: boolean): void {
    const view = this.view;
    if (!view) return;
    // At least 16 px (times the phone boost), and below the hero's health words as measured (they wrap to several lines when boosted).
    const px = Math.round(16 * phoneBoost(this, 2));
    const label = this.labels[team];
    const top = chipRowTop(Math.max(CHIP_Y, SLIM_H + 2, benched ? CHIP_BOTTOM : 0), label);
    const chips = collectStatusChips(view, team, c.id, c.element, x, this.highContrast, { scale: px / CHIP_FONT, top });
    const now = view.tick;
    const reduced = this.reduceMotion;
    const tracker = (this.chipTrackers[team] ??= new StatusTracker<ChipLook>(12));
    const cur = new Map<string, { payload: ChipLook; start: number; expire: number }>();
    for (const chip of chips) cur.set(chip.key, { payload: { x: chip.x, y: chip.y, w: chip.w, h: chip.h, color: chip.color }, start: 0, expire: 0 });
    const born = new Map(tracker.update(now, cur).map((t) => [t.key, t.born]));
    chips.forEach((chip, i) => {
      const slot = team * CHIP_MAX + i;
      const t = (this.chipTexts[slot] ??= this.add
        .text(0, 0, '', crisp(this, { fontFamily: HUD_FONT, fontSize: `${String(px)}px`, color: '#d8d2c4', fontStyle: 'normal', stroke: '#0a0806', strokeThickness: 2 }))
        .setDepth(102));
      const age = now - (born.get(chip.key) ?? Number.NEGATIVE_INFINITY);
      // Apply pop: the chip swells about its centre and settles; a flash washes over it (no motion under reduced motion).
      const pop = chipPop(age, reduced);
      const w = chip.w * pop;
      const h = chip.h * pop;
      const x = chip.x - (w - chip.w) / 2;
      const y = chip.y - (h - chip.h) / 2;
      const low = chip.secs !== null && chip.secs <= 1;
      const shown = !low || chipBlink(now % 49, reduced);
      t.setFontSize(px).setText(chip.text).setPosition(chip.x + 4, chip.y + Math.round((chip.h - t.height) / 2)).setVisible(true).setAlpha(shown ? 1 : 0.45);
      gfx.fillStyle(0x0d0b09, 0.78).fillRect(x, y, w, h);
      const flash = chipFlash(age, reduced);
      if (flash > 0) gfx.fillStyle(mute(chip.color, 0.5, 1.3), flash * 0.5).fillRect(x, y, w, h);
      // Time bar along the foot of the chip, draining to the left.
      gfx.fillStyle(chip.color, shown ? 0.85 : 0.4).fillRect(chip.x + 1, chip.y + chip.h - 3, Math.round((chip.w - 2) * chip.remaining), 2);
      // Shape icon in a draining timer ring at the chip's right end: the silhouette codes the status without colour.
      const id = /^s(\d+)$/.exec(chip.key);
      const icon = id ? STATUS_LOOKS[Number(id[1])]?.icon : chip.key === 'root' ? ROOT_ICON : undefined;
      if (icon) {
        const r = Math.max(5, Math.round(chip.h / 2) - 2);
        const cx = chip.x + chip.w - r - 4;
        const cy = chip.y + chip.h / 2;
        gfx.lineStyle(1, chip.color, 0.3).strokeCircle(cx, cy, r);
        gfx.lineStyle(2, chip.color, shown ? 0.9 : 0.4).beginPath().arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * chip.remaining, false).strokePath();
        gfx.lineStyle(1.5, chip.color, 0.95);
        for (let k = 0; k + 3 < icon.length; k += 2) gfx.lineBetween(cx + (icon[k] ?? 0) * r * 0.55, cy + (icon[k + 1] ?? 0) * r * 0.55, cx + (icon[k + 2] ?? 0) * r * 0.55, cy + (icon[k + 3] ?? 0) * r * 0.55);
      }
      // Buffs have a solid frame, debuffs a dashed one (so the two differ without colour).
      gfx.lineStyle(this.highContrast ? 2 : 1, chip.color, this.highContrast ? 1 : 0.75);
      if (chip.hostile) {
        for (const [a, b] of dashSegments(chip.x, chip.x + chip.w, [6, 3])) {
          gfx.lineBetween(a, chip.y, b, chip.y);
          gfx.lineBetween(a, chip.y + chip.h, b, chip.y + chip.h);
        }
        gfx.lineBetween(chip.x, chip.y, chip.x, chip.y + chip.h);
        gfx.lineBetween(chip.x + chip.w, chip.y, chip.x + chip.w, chip.y + chip.h);
      } else gfx.strokeRect(chip.x, chip.y, chip.w, chip.h);
    });
    // An ended chip leaves nothing behind (an empty outlined box read as clutter: qa-r3-label-clutter).
    this.hideChips(team, chips.length);
  }

  private hideChips(team: number, from: number): void {
    for (let i = from; i < CHIP_MAX; i++) this.chipTexts[team * CHIP_MAX + i]?.setVisible(false);
  }

  private get classic(): boolean {
    return !this.arcade && !this.highContrast;
  }

  /** Arcade: the active hero's picture at the end of its health bar (`arcadeAvatar`), in an element-coloured frame. */
  private drawArcadeAvatar(gfx: Phaser.GameObjects.Graphics, team: number, c: HudCharacter): void {
    const a = slimPortrait(team);
    this.back?.fillStyle(0x070a12, 0.78).fillRoundedRect(a.x - 2, a.y - 2, a.size + 4, a.size + 4, 4);
    this.placePortrait(this.portraits[team], c, a.x, a.y, a.size, team === 1);
    gfx.lineStyle(this.highContrast ? 3 : 2, this.highContrast ? 0xffffff : mute(ELEMENT_COLORS[c.element], 0.55, 0.72), 0.9);
    gfx.strokeRoundedRect(a.x - 2, a.y - 2, a.size + 4, a.size + 4, 4);
    this.drawMark(gfx, c.element, a.x + 8, a.y + 8, 6);
  }

  /** Element silhouette (white on a dark chip) so identity is never the frame colour alone: see `elementMark`. */
  private drawMark(gfx: Phaser.GameObjects.Graphics, element: HudCharacter['element'], x: number, y: number, r: number): void {
    gfx.fillStyle(0x070a12, 0.9).fillCircle(x, y, r + 3);
    gfx.lineStyle(2, 0xffffff, 1).fillStyle(0xffffff, 1);
    const m = elementMark(element, r);
    const at = (flat: readonly number[]): Phaser.Math.Vector2[] => {
      const out: Phaser.Math.Vector2[] = [];
      for (let k = 0; k + 1 < flat.length; k += 2) out.push(new Phaser.Math.Vector2(x + (flat[k] ?? 0), y + (flat[k + 1] ?? 0)));
      return out;
    };
    if (m.kind === 'circle') gfx.fillCircle(x, y, m.r);
    else if (m.kind === 'poly') {
      gfx.fillPoints(at(m.pts), true);
      if (m.hole) gfx.fillStyle(0x070a12, 1).fillPoints(at(m.hole), true);
    }
    else for (const run of m.runs) gfx.strokePoints(at(run), false);
  }

  /** Portrait frame, the active monster's picture and a small picture per benched teammate (dimmed with a cross when knocked out). */
  private drawPortrait(gfx: Phaser.GameObjects.Graphics, team: number, c: HudCharacter, bench: readonly HudCharacter[]): void {
    const x = portraitX(team);
    const back = this.back;
    back?.fillStyle(0x070a12, 0.78);
    back?.fillRoundedRect(x - 3, PORTRAIT_Y - 3, PORTRAIT + 6, PORTRAIT + 6, 6);
    this.placePortrait(this.portraits[team], c, x, PORTRAIT_Y, PORTRAIT, team === 1);
    gfx.lineStyle(2, this.highContrast ? 0xffffff : mute(ELEMENT_COLORS[c.element], 0.55, 0.72), 0.9);
    gfx.strokeRoundedRect(x - 3, PORTRAIT_Y - 3, PORTRAIT + 6, PORTRAIT + 6, 6);
    this.drawMark(gfx, c.element, x + 10, PORTRAIT_Y + 10, 8);
    // Benched teammates: their picture sits in the slot just left of their own bar.
    for (let i = 0; i < 4; i++) {
      const b = bench[i];
      const im = this.portraits[TEAMS.length + team * 4 + i];
      if (!b) {
        im?.setVisible(false);
        continue;
      }
      const { x: bx, y: by, size: s } = benchPortraitRect(team, i);
      back?.fillStyle(0x070a12, 0.78);
      back?.fillRoundedRect(bx - 2, by - 2, s + 4, s + 4, 4);
      this.placePortrait(im, b, bx, by, s, team === 1);
      im?.setAlpha(b.dead ? 0.35 : 1);
      gfx.lineStyle(2, b.dead ? 0x777777 : this.highContrast ? ELEMENT_COLORS[b.element] : mute(ELEMENT_COLORS[b.element], 0.55, 0.72), 0.9);
      gfx.strokeRoundedRect(bx - 2, by - 2, s + 4, s + 4, 4);
      this.drawMark(gfx, b.element, bx + 6, by + s - 6, 5);
      if (b.dead) {
        gfx.lineStyle(2, 0xff5a4a, 1);
        gfx.lineBetween(bx + 3, by + 3, bx + s - 3, by + s - 3);
        gfx.lineBetween(bx + 3, by + s - 3, bx + s - 3, by + 3);
      }
    }
  }

  /** Put a character's picture (the first frame of its sprite sheet) in a pooled image, or hide the image when it has none. */
  private placePortrait(im: Phaser.GameObjects.Image | undefined, c: HudCharacter, x: number, y: number, size: number, flip: boolean): void {
    const found = lookup(c.sprite);
    if (im && found && this.textures.exists(found.key)) {
      const tex = this.textures.get(found.key);
      const [fx = 0, fy = 0, fw = 80, fh = 80] = found.entry.coords;
      if (!tex.has(PORTRAIT_FRAME)) tex.add(PORTRAIT_FRAME, 0, fx, fy, fw, fh);
      // Grim grade (fx/hero-grade.ts): the portrait is drawn from the graded copy, which needs the portrait frame too.
      const shown = gradedHeroTexture(this, found.key);
      if (shown !== found.key) {
        const gtex = this.textures.get(shown);
        if (!gtex.has(PORTRAIT_FRAME)) gtex.add(PORTRAIT_FRAME, 0, fx, fy, fw, fh);
      }
      if (im.texture.key !== shown || im.frame.name !== PORTRAIT_FRAME) im.setTexture(shown, PORTRAIT_FRAME);
      im.setPosition(x, y).setDisplaySize(size, size).setFlipX(flip).setAlpha(1).setVisible(true);
    } else im?.setVisible(false);
  }

  /** Regen text for a bench row: the live +N/s while healing, `rested` at the cap. Right of the player's bars, left of the enemy's. */
  private drawRegenText(team: number, row: number, c: HudCharacter): void {
    const slot = team * 4 + row;
    const text = regenLabel(c);
    if (text === '') {
      this.regenTexts[slot]?.setVisible(false);
      return;
    }
    const g = benchBar(sideOffset(team), row);
    const at = regenAnchor(team, g);
    const t = this.regenTexts[slot] ?? this.text(16).setOrigin(team === 0 ? 0 : 1, 0.5);
    this.regenTexts[slot] = t;
    const healing = regenState(c) === 'healing';
    t.setPosition(at.x, at.y)
      .setColor(healing ? '#9dffa0' : '#c8d0e0')
      .setAlpha(healing && !this.reduceMotion ? criticalPulse(this.time.now, false) * 0.4 + 0.6 : 1)
      .setVisible(true);
    if (t.text !== text) t.setText(text);
  }

  private refreshPrefs(): void {
    const prefs = getPrefs();
    this.highContrast = prefs.highContrast;
    this.reduceMotion = prefs.reduceMotion;
  }

  private text(size: number): Phaser.GameObjects.Text {
    const style = { fontFamily: HUD_FONT, fontSize: `${String(size)}px`, color: '#e0d8c6', fontStyle: 'bold', stroke: '#0a0806', strokeThickness: 3 };
    return this.add.text(0, 0, '', crisp(this, style)).setDepth(102);
  }

  /**
   * Damage numbers float up (fade in place with reduced motion); combo counters pop at 3/5/8 hits (no pop when reduced);
   * the hyper meters.
   */
  private drawArcade(model: ArcadeHudModel): void {
    const reduced = this.reduceMotion;
    for (let i = 0; i < model.numbers.length; i++) {
      const n = model.numbers[i];
      let t = this.numberTexts[i];
      if (!n?.live) {
        t?.setVisible(false);
        continue;
      }
      t ??= this.numberTexts[i] = this.text(24).setOrigin(0.5, 1);
      if (this.numberSerials[i] !== n.serial) {
        this.numberSerials[i] = n.serial;
        // Scaled hits are grey and smaller, counters gold and labelled: never colour alone.
        t.setText(numberLabel(n.amount, n.counter))
          .setColor(n.scaled ? '#b0b0b0' : n.counter ? '#ffd23f' : '#ffffff')
          .setFontSize(n.scaled ? 18 : 24);
      }
      t.setPosition(n.x, n.y + numberRise(n.age, reduced)).setAlpha(numberAlpha(n.age)).setVisible(true);
    }
    for (const team of TEAMS) {
      this.drawMeter(model, team);
      const c = model.combos[team];
      let t = this.comboTexts[team];
      if (c.hits === 0) {
        t?.setVisible(false);
        continue;
      }
      t ??= this.comboTexts[team] = this.text(28)
        .setColor('#ffe066')
        .setOrigin(team === 0 ? 0 : 1, 0)
        .setAlign(team === 0 ? 'left' : 'right')
        .setPosition(team === 0 ? COMBO_MARGIN : HUD_WIDTH - COMBO_MARGIN, COMBO_Y);
      const key = comboKey(c.hits, c.damage);
      if (this.comboKeys[team] !== key) {
        this.comboKeys[team] = key;
        t.setText(comboLabel(c.hits, c.damage));
      }
      t.setScale(comboScale(c, reduced)).setAlpha(comboAlpha(c)).setVisible(true);
    }
  }

  /**
   * Hyper meter under the HUD, toward the centre: three segments, full ones solid and the filling one dashed, the bar
   * count as a number beside it (MAX when full), and a once-a-second fill pulse when full (steady with reduced motion).
   */
  private drawMeter(model: ArcadeHudModel, team: 0 | 1): void {
    const gfx = this.gfx;
    const m = model.meters[team];
    if (!gfx) return;
    const inner = team === 0 ? slimBar(0).maxX : slimBar(1).minX;
    const x = meterX(team, inner);
    const color = this.highContrast ? 0xffffff : METER_COLOR;
    const mid = METER_Y + SEGMENT_H / 2;
    const alpha = meterFlashAlpha(m, this.reduceMotion);
    for (const seg of meterSegments(m.value, x)) {
      gfx.fillStyle(0x000000, 0.6);
      gfx.fillRect(seg.x, METER_Y, SEGMENT_W, SEGMENT_H);
      if (seg.full) {
        gfx.fillStyle(color, alpha);
        gfx.fillRect(seg.x, METER_Y, SEGMENT_W, SEGMENT_H);
      } else if (seg.fill > 0) {
        gfx.lineStyle(SEGMENT_H, color, 1);
        for (const [x0, x1] of dashSegments(seg.x, seg.x + seg.fill, CHARGE_DASH)) gfx.lineBetween(x0, mid, x1, mid);
      }
      // Dark then light outline, so the segments read on both bright and dark arenas.
      gfx.lineStyle(3, 0x000000, 1);
      gfx.strokeRect(seg.x, METER_Y, SEGMENT_W, SEGMENT_H);
      gfx.lineStyle(this.highContrast ? 2 : 1, 0xffffff, 1);
      gfx.strokeRect(seg.x, METER_Y, SEGMENT_W, SEGMENT_H);
    }
    const t = (this.meterTexts[team] ??= this.text(12)
      .setOrigin(team === 0 ? 1 : 0, 0.5)
      .setPosition(team === 0 ? x - METER_LABEL_GAP : x + METER_W + METER_LABEL_GAP, mid));
    const label = `SUPER ${meterLabel(m.value)}`; // named, so the segments are not mistaken for the round pips
    if (t.text !== label) t.setText(label);
  }

  private drawBar(gfx: Phaser.GameObjects.Graphics, g: BarGeometry, c: HudCharacter, main: boolean): void {
    if (!this.arcade && !this.highContrast) {
      this.drawClassicBar(gfx, g, c, main);
      return;
    }
    const stroke = (width: number, color: number, toX: number, alpha = 1): void => {
      gfx.lineStyle(width, color, alpha);
      gfx.lineBetween(g.minX, g.y, toX, g.y);
    };
    stroke(g.lineMax, this.highContrast ? 0xffffff : TRACK_COLOR, g.maxX);
    if (this.highContrast) stroke(g.lineMax - 2, MAX_COLOR, g.maxX);
    else this.thinFrame(gfx, g);
    if (c.dead) return;
    const fill = barFill(g, c.hp, c.maxHp, c.restCap, this.highContrast);
    const frac = c.maxHp > 0 ? c.hp / c.maxHp : 0;
    // Slim (Arcade) bars wear the hero's element colour and flash red when critical; the Classic high-contrast bar keeps its ramp.
    const color = this.highContrast ? fill.color : this.arcade ? lifeFill(mute(ELEMENT_COLORS[c.element], 0.7, 0.8), frac, frac <= LOW_FLASH_AT ? criticalPulse(this.time.now, this.reduceMotion) : 0) : grimHealthColor(frac);
    stroke(g.line, REST_COLOR, fill.restX, this.highContrast ? 1 : 0.4);
    if (c.hp > 0) {
      // Pattern cue: solid when healthy, long dashes when hurt, short dashes when critical.
      const cue = healthCue(c.hp / Math.max(1, c.maxHp));
      gfx.lineStyle(g.line, color, 1);
      const segs = dashSegments(g.minX, fill.curX, cue.dash);
      for (const [x0, x1] of segs) gfx.lineBetween(x0, g.y, x1, g.y);
      if (!this.highContrast) this.grain(gfx, g, segs);
    }
  }

  /** A thin dark frame round the track (the grim replacement for a bold plate). */
  private thinFrame(gfx: Phaser.GameObjects.Graphics, g: BarGeometry): void {
    gfx.lineStyle(1, FRAME_COLOR, 0.9);
    gfx.strokeRect(g.minX - 0.5, g.y - g.lineMax / 2 - 0.5, g.maxX - g.minX + 1, g.lineMax + 1);
  }

  /**
   * Low-life edge grain: still dark flecks (integer hash, nothing random or flickering) thickest at the screen edge, shown at an
   * alpha that follows the vignette strength. Drawn once, on first need, below the HUD.
   */
  edgeGrain(strength: number): void {
    if (strength <= 0) {
      this.grainGfx?.setVisible(false);
      return;
    }
    if (!this.grainGfx) {
      const g = this.add.graphics().setDepth(97);
      for (const f of edgeGrainFlecks()) g.fillStyle(f.color, f.alpha).fillRect(f.x, f.y, 2, 2);
      this.grainGfx = g;
    }
    this.grainGfx.setVisible(true).setAlpha(Math.min(1, strength / 0.45));
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
      gfx.lineStyle(2, 0xb5301f, criticalPulse(this.time.now, this.reduceMotion));
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
      const pulse = this.reduceMotion ? 0.5 : criticalPulse(this.time.now, false);
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
