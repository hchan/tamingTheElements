import Phaser from 'phaser';
import type { RenderView } from '@core/index';
import { ELEMENT_COLORS } from '../fx/element-colors';
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
  BENCH_SPRITE,
  collectSide,
  criticalPulse,
  shade,
  dashSegments,
  activeHeroText,
  healthCue,
  arcadeAvatar,
  mainBar,
  regenLabel,
  regenState,
  sideOffset,
  type BarGeometry,
  type HudCharacter,
} from '../hud/bars';

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

const TEAMS = [0, 1] as const;
/** Classic portrait: the active monster beside its health bar (left of the player's, right of the enemy's). */
const PORTRAIT = 52;
/** Below the fullscreen button in the top-right corner. */
const PORTRAIT_Y = 44;
const PORTRAIT_FRAME = 'portrait';
/** Lowest the top of a bench portrait may sit: just under the main bar. */
const BENCH_TOP = 24;
function portraitX(team: number): number {
  return team === 0 ? 30 : HUD_WIDTH - 20 - PORTRAIT;
}
const HUD_FONT = '"Trebuchet MS", Verdana, "Segoe UI", sans-serif';
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
  private portraits: Phaser.GameObjects.Image[] = [];
  /** Regen text per bench row, pooled: index team * 4 + row. */
  private regenTexts: (Phaser.GameObjects.Text | undefined)[] = [];
  private highContrast = false;
  private reduceMotion = false;
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

  constructor() {
    super(HUD_SCENE);
  }

  init(data: HudData): void {
    this.view = data.view;
    this.arcade = data.arcade;
  }

  create(): void {
    fitScene(this);
    this.back = this.add.graphics().setDepth(98);
    this.gfx = this.add.graphics().setDepth(100);
    this.portraits = [...TEAMS, ...TEAMS.flatMap((t) => [t, t, t, t])].map(() => this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(99).setVisible(false));
    // One text per side next to the bar: health state in words, so it never depends on red versus green.
    // Larger on phones (the canvas is drawn about 0.3x there), wrapped to the free column left of the bench bars, and outlined so it
    // reads on bright arenas without touching the bars beside it.
    const boost = phoneBoost(this, 2);
    this.labels = TEAMS.map((team) =>
      this.add
        .text(
          mainBar(sideOffset(team)).minX,
          22,
          '',
          crisp(this, {
            fontFamily: HUD_FONT,
            fontSize: `${String(Math.round(17 * boost))}px`,
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
            wordWrap: { width: 110 },
          }),
        )
        .setDepth(101),
    );
    this.refreshPrefs();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.removeAllListeners(Phaser.Scenes.Events.SHUTDOWN);
      this.gfx?.destroy();
      this.gfx = undefined;
      this.back?.destroy();
      this.back = undefined;
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
        this.drawBar(gfx, mainBar(x), side.active, true);
        label?.setText(activeHeroText(heroName(side.active.sprite), side.active, this.classic));
        if (this.arcade) this.drawArcadeAvatar(gfx, team, side.active);
        else this.drawPortrait(gfx, team, side.active, side.bench);
        if (this.arcade) this.drawStatusChips(gfx, team, side.active, x);
        else this.drawLegacyBuffs(gfx, view, side.active, x);
      } else {
        label?.setText('');
        this.hideChips(team, 0);
        for (const i of [team, ...[0, 1, 2, 3].map((k) => TEAMS.length + team * 4 + k)]) this.portraits[i]?.setVisible(false);
      }
      side.bench.forEach((c, i) => {
        this.drawBar(gfx, benchBar(x, i), c, false);
        if (this.classic) this.drawRegenText(team, i, c);
      });
      for (let i = side.bench.length; i < 4; i++) this.regenTexts[team * 4 + i]?.setVisible(false);
    }
    if (this.arcade) this.drawArcade(this.arcade);
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
  private drawStatusChips(gfx: Phaser.GameObjects.Graphics, team: number, c: HudCharacter, x: number): void {
    const view = this.view;
    if (!view) return;
    // At least 16 px (times the phone boost), and below the hero's health words as measured (they wrap to several lines when boosted).
    const px = Math.round(16 * phoneBoost(this, 2));
    const label = this.labels[team];
    const top = Math.max(CHIP_Y, label && label.text !== '' ? Math.ceil(label.y + label.height) + 2 : 0);
    const chips = collectStatusChips(view, team, c.id, c.element, x, this.highContrast, { scale: px / CHIP_FONT, top });
    chips.forEach((chip, i) => {
      const slot = team * CHIP_MAX + i;
      const t = (this.chipTexts[slot] ??= this.add
        .text(0, 0, '', crisp(this, { fontFamily: HUD_FONT, fontSize: `${String(px)}px`, color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 }))
        .setDepth(102));
      t.setFontSize(px).setText(chip.text).setPosition(chip.x + 4, chip.y + Math.round((chip.h - t.height) / 2)).setVisible(true);
      gfx.fillStyle(0x070a12, 0.8).fillRoundedRect(chip.x, chip.y, chip.w, chip.h, 3);
      // Time bar along the foot of the chip, draining to the left.
      gfx.fillStyle(chip.color, 1).fillRect(chip.x + 1, chip.y + chip.h - 3, Math.round((chip.w - 2) * chip.remaining), 2);
      // Buffs have a solid frame, debuffs a dashed one (so the two differ without colour).
      gfx.lineStyle(this.highContrast ? 2 : 1, chip.color, 1);
      if (chip.hostile) {
        for (const [a, b] of dashSegments(chip.x, chip.x + chip.w, [6, 3])) {
          gfx.lineBetween(a, chip.y, b, chip.y);
          gfx.lineBetween(a, chip.y + chip.h, b, chip.y + chip.h);
        }
        gfx.lineBetween(chip.x, chip.y, chip.x, chip.y + chip.h);
        gfx.lineBetween(chip.x + chip.w, chip.y, chip.x + chip.w, chip.y + chip.h);
      } else gfx.strokeRoundedRect(chip.x, chip.y, chip.w, chip.h, 3);
    });
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
    const a = arcadeAvatar(team);
    this.back?.fillStyle(0x070a12, 0.78).fillRoundedRect(a.x - 2, a.y - 2, a.size + 4, a.size + 4, 4);
    this.placePortrait(this.portraits[team], c, a.x, a.y, a.size, team === 1);
    gfx.lineStyle(this.highContrast ? 3 : 2, this.highContrast ? 0xffffff : ELEMENT_COLORS[c.element], 0.95);
    gfx.strokeRoundedRect(a.x - 2, a.y - 2, a.size + 4, a.size + 4, 4);
    this.drawMark(gfx, c.element, a.x + 9, a.y + 9, 7);
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
    gfx.lineStyle(2, ELEMENT_COLORS[c.element], 0.95);
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
      const g = benchBar(sideOffset(team), i);
      // Small enough to clear the main bar above and the health words to the left.
      const s = BENCH_SPRITE - 14;
      const bx = g.minX - 5 - s;
      const by = Math.max(g.y - s / 2, BENCH_TOP);
      back?.fillStyle(0x070a12, 0.78);
      back?.fillRoundedRect(bx - 2, by - 2, s + 4, s + 4, 4);
      this.placePortrait(im, b, bx, by, s, team === 1);
      im?.setAlpha(b.dead ? 0.35 : 1);
      gfx.lineStyle(2, b.dead ? 0x777777 : ELEMENT_COLORS[b.element], 0.95);
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
      if (im.texture.key !== found.key || im.frame.name !== PORTRAIT_FRAME) im.setTexture(found.key, PORTRAIT_FRAME);
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
    const t = this.regenTexts[slot] ?? this.text(16).setOrigin(team === 0 ? 0 : 1, 0.5);
    this.regenTexts[slot] = t;
    const healing = regenState(c) === 'healing';
    t.setPosition(team === 0 ? g.maxX + 10 : sideOffset(1) + 120 - 10 - 2, g.y)
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
    const style = { fontSize: `${String(size)}px`, color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 };
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
      const key = c.hits * 100_000 + Math.round(c.damage);
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
    const inner = team === 0 ? mainBar(0).maxX : mainBar(sideOffset(1)).minX;
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
    const t = (this.meterTexts[team] ??= this.text(16)
      .setOrigin(team === 0 ? 1 : 0, 0.5)
      .setPosition(team === 0 ? x - METER_LABEL_GAP : x + METER_W + METER_LABEL_GAP, mid));
    const label = meterLabel(m.value);
    if (t.text !== label) t.setText(label);
  }

  private drawBar(gfx: Phaser.GameObjects.Graphics, g: BarGeometry, c: HudCharacter, main: boolean): void {
    if (!this.arcade && !this.highContrast) {
      this.drawClassicBar(gfx, g, c, main);
      return;
    }
    const stroke = (width: number, color: number, toX: number): void => {
      gfx.lineStyle(width, color, 1);
      gfx.lineBetween(g.minX, g.y, toX, g.y);
    };
    stroke(g.lineMax, this.highContrast ? 0xffffff : MAX_COLOR, g.maxX);
    if (this.highContrast) stroke(g.lineMax - 2, MAX_COLOR, g.maxX);
    if (c.dead) return;
    const fill = barFill(g, c.hp, c.maxHp, c.restCap, this.highContrast);
    stroke(g.line, REST_COLOR, fill.restX);
    if (c.hp > 0) {
      // Pattern cue: solid when healthy, long dashes when hurt, short dashes when critical.
      const cue = healthCue(c.hp / Math.max(1, c.maxHp));
      gfx.lineStyle(g.line, fill.color, 1);
      for (const [x0, x1] of dashSegments(g.minX, fill.curX, cue.dash)) gfx.lineBetween(x0, g.y, x1, g.y);
    }
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
    gfx.fillStyle(0x070a12, c.dead ? 0.45 : 0.78);
    gfx.fillRoundedRect(px, top - pad, pw, ph, 4);
    if (critical) {
      gfx.lineStyle(2, 0xff3b30, criticalPulse(this.time.now, this.reduceMotion));
      gfx.strokeRoundedRect(px, top - pad, pw, ph, 4);
    } else {
      gfx.lineStyle(main ? 2 : 1, accent, c.dead ? 0.3 : 0.9);
      gfx.strokeRoundedRect(px, top - pad, pw, ph, 4);
    }
    if (c.dead) {
      gfx.lineStyle(2, 0xff5a4a, 0.85);
      const cx = g.minX + 7;
      gfx.lineBetween(cx - 4, g.y - 4, cx + 4, g.y + 4);
      gfx.lineBetween(cx - 4, g.y + 4, cx + 4, g.y - 4);
      return;
    }
    const fill = barFill(g, c.hp, c.maxHp, c.restCap, false);
    gfx.lineStyle(g.line, REST_COLOR, 0.55);
    gfx.lineBetween(g.minX, g.y, fill.restX, g.y);
    // Recovering ghost: the span between health and the rest cap that a benched teammate refills (pulsing light green while healing).
    if (c.benched && fill.restX > fill.curX && c.hp > 0) {
      const pulse = this.reduceMotion ? 0.5 : criticalPulse(this.time.now, false);
      gfx.lineStyle(g.line, 0xb6ffb0, 0.3 + 0.35 * pulse);
      gfx.lineBetween(fill.curX, g.y, fill.restX, g.y);
    }
    if (c.hp <= 0) return;
    const cue = healthCue(frac);
    const segs = dashSegments(g.minX, fill.curX, cue.dash);
    gfx.lineStyle(g.line, shade(fill.color, 0.8), 1);
    for (const [x0, x1] of segs) gfx.lineBetween(x0, g.y, x1, g.y);
    // Lit top edge of the fill.
    gfx.lineStyle(Math.max(2, Math.round(g.line / 3)), shade(fill.color, 1.35), 0.9);
    for (const [x0, x1] of segs) gfx.lineBetween(x0, g.y - g.line / 3, x1, g.y - g.line / 3);
  }
}
