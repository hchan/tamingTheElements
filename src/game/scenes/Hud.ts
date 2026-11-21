import Phaser from 'phaser';
import type { RenderView } from '@core/index';
import { ELEMENT_COLORS } from '../fx/element-colors';
import { mute } from '../fx/grim-fx';
import { ROOT_ICON, STATUS_LOOKS, StatusTracker, chipBlink, chipFlash, chipPop } from '../fx/status-fx';
import { coreDisplayWidth, crisp, fitScene, phoneBoost, viewHeight, viewWidth } from '../boot/viewport';
import { lookup } from '../views/projectile-view';
import { heroName } from '../hud/tag-fx';
import { elementMark } from '../hud/element-mark';
import { getPrefs } from '../platform/a11y/prefs';
import { BUFF_SLOT, collectBuffs } from '../hud/buffs';
import { CC_ICONS, CHIP_FONT, CHIP_MAX, CHIP_Y, PORTRAIT_CHIP_MAX, collectStatusChips } from '../hud/status-icons';
import {
  CHARGE_DASH, CHIP_RECTS_KEY, hudFrame, METER_W, METER_Y, SEGMENT_H, SEGMENT_W, meterLabel, meterFlashAlpha, readyGlow,
  HUD_AVOID_KEY, gapLabel, type HudRect, meterLabelY, meterSegments, meterX, NUMBER_BANNER_ALPHA, type ArcadeHudModel,
} from '../hud/arcade-hud';
import {
  benchBar,
  collectSide,
  criticalPulse,
  dashSegments,
  activeHeroText,
  mainBar,
  regenLabel,
  regenState,
  sideOffset,
  type HudCharacter,
} from '../hud/bars';
import {
  CHIP_BOTTOM, CHIP_Y as BENCH_CHIP_Y, getChipDrop, setChipDrop, setPhoneHud, SLIM_BAR_Y, SLIM_LINE_MAX, SLIM_H, chipBar, isPhoneHud, chipRect, compactLabel, portraitLifeCandidates, shortName, slimBar, slimPortrait, SLIM_ROW_B,
} from '../hud/slim-hud';
import { gradedHeroTexture } from '../fx/hero-grade';
import { HudChrome } from '../hud/hud-chrome';
import { HUD_FONT, hudText, newHudFlags } from '../hud/hud-ctx';
import { HudNumbers } from '../hud/hud-numbers';
import { HudCombo } from '../hud/hud-combo';
import { HudBarPainter } from '../hud/hud-bar-painter';
import { PORTRAIT, PORTRAIT_Y, benchPortraitRect, chipRowTop, phoneFontPx, portraitMeterRowY, portraitX, regenAnchor } from '../hud/hud-math';
import { isPortraitPlay } from '../boot/portrait-play';
import type { ComboProbe } from '../platform/test-hook';

export const HUD_SCENE = 'Hud';

export interface HudData {
  readonly view: RenderView;
  /** Arcade matches only: damage numbers and combo counters, fed and aged by the Arena. */
  readonly arcade?: ArcadeHudModel;
  /** Arcade: the Arena camera's world view (from scroll and zoom), so world-space damage numbers can be projected to the screen. */
  readonly arenaView?: () => HudRect;
}

/** Hyper meter fill (high contrast: white) and the gap between the meter and its bar-count label. */
const METER_COLOR = 0x4fc3ff;
const METER_LABEL_GAP = 8;
/** Largest phone boost for the slim Arcade HUD text (life line, SUPER label): about 12 CSS px at 844x390 (qa-r15: was 1.4 and an unboosted SUPER, 6 px), still clear of the bars. */
const PHONE_ARCADE_BOOST = 1.7;

/** The SUPER label's own phone boost cap: between the life bar and the bench portraits there is room for about 21 logical px of text (qa-r12: at 1.7 it sat on the portraits; `meterLabelY` now lifts it clear, so r20 raised it to 1.7 again for ~11 CSS px on a phone). */
const SUPER_LABEL_BOOST = 1.95;
/** The life line's size steps (of its boosted size) tried before the hero name is cut. */
const LIFE_TEXT_SCALES: readonly number[] = [1, 0.85, 0.72, 0.62];
/** Smallest effective size (CSS px) the HUD life line and labels shrink to on a phone; the name is cut before the text goes smaller. */
const MIN_PHONE_PX = 11;
/** Portrait phone (hud hud-phone-text): the names, life numbers and SUPER labels are drawn at this many CSS px or more (the landscape floor above stays 11). */
const PORTRAIT_TEXT_PX = 14.2;
/** Portrait phone: a name never reaches past this logical x (team 0; team 1 mirrors it), so it clears the timer and the round pips. */
const PORTRAIT_NAME_EDGE = 535;
const PORTRAIT_NAME_EDGE_TAG = 505;
/** Fewest hero-name letters the phone life line keeps (with the ellipsis) before it falls back to a bare number. */
const MIN_LIFE_NAME = 5;

const TEAMS = [0, 1] as const;

/** Portrait phone: the status chips start this far under the HUD bar's fill (SLIM_H + 2), so they never touch it. */
const PHONE_CHIP_GAP = 6;

/** Where a status chip was and its colour, kept so the expire flash can outline it after it ends. */
interface ChipLook {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: number;
}
const PORTRAIT_FRAME = 'portrait';
/** Portrait phone: gap (logical px) between the name/SUPER text and the bench chips under it. */
const PORTRAIT_CHIP_GAP = 12;
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
  private readonly chrome = new HudChrome(this);
  private readonly flags = newHudFlags();
  private readonly bars = new HudBarPainter(this, this.flags);
  private chipTrackers: StatusTracker<ChipLook>[] = [];
  private arcade: ArcadeHudModel | undefined;
  /** Per team: the longest hit-stun left seen since it began (the STUN chip's bar total). */
  private readonly stunTotals: number[] = [0, 0];
  private meterTexts: (Phaser.GameObjects.Text | undefined)[] = [];
  /** Centre y of the SUPER segments and label: the plain METER_Y row, or a second row under the names in portrait play (set by `dropChips`). */
  /** Portrait play: the lowest logical y of the names and the SUPER row (the status chips start under it). */
  private portraitBottom = 0;
  private meterRowY = METER_Y + SEGMENT_H / 2;
  private readonly meterTight: boolean[] = [false, false];
  /** Arcade status chip words, pooled per side: index team * CHIP_MAX + slot. */
  private chipTexts: (Phaser.GameObjects.Text | undefined)[] = [];
  private arenaView: (() => HudRect) | undefined;
  /** Arcade: each side's last active hero (name, max life), kept for the K.O. gap label. */
  private lastActive: ({ name: string; maxHp: number } | undefined)[] = [];
  /** The HUD camera's frame this frame (wider than 1280 on a wide view). */
  private readonly viewFrame = { x: 0, y: 0, w: 1280, h: 720 };
  private readonly benchCount = [0, 0];
  private readonly numbers = new HudNumbers(this, this.flags);
  private readonly combo = new HudCombo(this, this.flags, {
    numbers: this.numbers,
    viewFrame: this.viewFrame,
    benchCount: this.benchCount,
    eachCeilText: (fn) => {
      for (const t of this.labels) fn(t);
      for (const t of this.meterTexts) fn(t);
    },
    arenaView: () => this.arenaView?.(),
  });

  constructor() {
    super(HUD_SCENE);
  }

  init(data: HudData): void {
    this.view = data.view;
    this.arcade = data.arcade;
    this.flags.arcade = !!data.arcade;
    this.arenaView = data.arenaView;
  }

  create(): void {
    fitScene(this, 'top');
    this.combo.coarse = (window.matchMedia as typeof window.matchMedia | undefined)?.('(pointer: coarse)').matches ?? false;
    if (this.arcade) this.chrome.drawScrim();
    this.back = this.add.graphics().setDepth(98);
    this.gfx = this.add.graphics().setDepth(100);
    this.portraits = [...TEAMS, ...TEAMS.flatMap((t) => [t, t, t, t])].map(() => this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(99).setVisible(false));
    // One text per side next to the bar: health state in words, so it never depends on red versus green.
    // Larger on phones (the canvas is drawn about 0.3x there), wrapped to the free column left of the bench bars, and outlined so it
    // reads on bright arenas without touching the bars beside it.
    const boost = this.arcade ? this.arcadeBoost() : phoneBoost(this, 2);
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
      this.bars.reset();
      setChipDrop(0);
      setPhoneHud(false);
      this.lastActive = [];
      this.chrome.destroy();
      for (const im of this.portraits) im.destroy();
      this.portraits = [];
      for (const t of [...this.labels, ...this.regenTexts, ...this.meterTexts, ...this.chipTexts]) t?.destroy();
      this.labels = [];
      this.regenTexts = [];
      this.numbers.destroy();
      this.combo.destroy();
      this.registry.remove(CHIP_RECTS_KEY);
      this.meterTexts = [];
      this.chipTexts = [];
      this.view = undefined;
      this.arcade = undefined;
      this.flags.arcade = false;
    });
  }

  /** Test hook: the visible damage numbers' boxes in Hud px (origin is bottom centre). */
  numberBoxes(): { x: number; y: number; w: number; h: number }[] {
    return this.numbers.boxes();
  }

  /** Test hook: the live white pops' and call-outs' boxes the numbers keep clear of, in Hud px. */
  popBoxes(): { x: number; y: number; w: number; h: number }[] {
    return this.numbers.popBoxes();
  }

  /** Test hook: one entry per visible combo counter (placement, lane, ceiling, obstacles). */
  comboBoxes(): ComboProbe[] {
    return this.combo.boxes(this.arcade);
  }

  /** Test hook: the words beside each side's main bar, as drawn. */
  heroLabels(): string[] {
    return this.labels.map((t) => t.text);
  }

  /** Test hook: every visible HUD text with its effective CSS px size (font px times the canvas scale) and screen box (x, y is the text's origin point; `ox` its horizontal origin 0..1). */
  textSizes(): { text: string; px: number; x: number; y: number; w: number; h: number; ox: number; oy: number }[] {
    const k = coreDisplayWidth(this) / 1280;
    const out: { text: string; px: number; x: number; y: number; w: number; h: number; ox: number; oy: number }[] = [];
    for (const o of this.children.list) {
      if (!(o instanceof Phaser.GameObjects.Text) || !o.visible || o.alpha === 0 || o.text.trim() === '') continue;
      out.push({ text: o.text, px: parseFloat(String(o.style.fontSize)) * k, x: o.x * k, y: o.y * k, w: o.width * k, h: o.height * k, ox: o.originX, oy: o.originY });
    }
    return out;
  }

  override update(_time?: number, delta = 1000 / 60): void {
    this.flags.frameMs = delta;
    const { view, gfx } = this;
    if (!view || !gfx) return;
    gfx.clear();
    this.back?.clear();
    if (++this.flags.frame % PREFS_REFRESH_FRAMES === 0) this.refreshPrefs();
    if (this.arcade) this.dropChips();
    for (const team of TEAMS) {
      const side = collectSide(view, team);
      this.benchCount[team] = side.bench.length;
      const x = sideOffset(team);
      const label = this.labels[team];
      if (side.active) {
        if (this.arcade) {
          // Every bar fills to its own hero's max life, so the fill always matches the Life number (qa-r30; a shorter scaled track read as half empty).
          // The size of each pool shows as 100 HP notches instead (WP-HC1; `lifeTicks`), so a 297 and a 591 hero are told apart at a glance.
          // Equal track length is on purpose (WP-HF1, the fighting-game convention: the bar reads as "how close to K.O.", not pool size); do not scale the track per hero.
          const bar = slimBar(team);
          this.lastActive[team] = { name: heroName(side.active.sprite), maxHp: side.active.maxHp };
          label?.setAlpha(1);
          this.bars.drawBar(gfx, bar, side.active, true);
          this.bars.drawTrail(gfx, bar, side.active);
          if (this.arcade.meters[team].full > 0 && !side.active.dead) this.bars.drawSuperRim(gfx, bar);
          if (label) this.setSlimLabel(label, team, heroName(side.active.sprite), side.active, true, side.bench.length > 0); // QA r105 P2: every fight keeps "cur/max" on a tight phone (was 2v2 only: 1v1 fell to a bare number)
        } else {
          this.bars.drawBar(gfx, mainBar(x), side.active, true);
          label?.setText(activeHeroText(heroName(side.active.sprite), side.active, this.classic));
        }
        if (this.arcade) this.drawArcadeAvatar(gfx, team, side.active);
        else this.drawPortrait(gfx, team, side.active, side.bench);
        if (this.arcade) this.drawStatusChips(gfx, team, side.active, x, side.bench.length > 0);
        else this.drawLegacyBuffs(gfx, view, side.active, x);
      } else {
        if (this.arcade) {
          // K.O. gap: keep the last hero's name greyed over an empty bar, instead of a blank label (qa-r64/r65).
          const last = this.lastActive[team];
          label?.setText(gapLabel(last, false)).setAlpha(0.6);
          if (last) this.bars.drawEmptyBar(gfx, slimBar(team), last.maxHp);
        } else label?.setText('');
        this.hideChips(team, 0);
        for (const i of [team, ...[0, 1, 2, 3].map((k) => TEAMS.length + team * 4 + k)]) this.portraits[i]?.setVisible(false);
      }
      side.bench.forEach((c, i) => {
        if (this.arcade) {
          this.drawChip(gfx, team, i, c);
          return;
        }
        this.bars.drawBar(gfx, benchBar(x, i), c, false);
        if (this.classic) this.drawRegenText(team, i, c);
      });
      for (let i = side.bench.length; i < 4; i++) this.regenTexts[team * 4 + i]?.setVisible(false);
    }
    if (this.arcade) {
      this.matchLifeFormat();
      this.drawArcade(this.arcade);
    }
  }

  /** One life format on both sides: when one label had to drop "/max" to keep its whole name, the other drops it too (r103 P2: "286" beside "547/547"). */
  private matchLifeFormat(): void {
    const [a, b] = this.labels;
    if (!a || !b || a.text === '' || b.text === '' || a.alpha < 1 || b.alpha < 1) return;
    const has = (t: string): boolean => /\d+\/\d+/.test(t);
    if (has(a.text) === has(b.text)) return;
    const l = has(a.text) ? a : b;
    l.setText(l.text.replace(/(\d+)\/\d+/, '$1'));
  }

  /** Arcade bench chip: a 68 px portrait with its element mark, a life bar under it, and a gold pulsing frame when a tag would work now (dimmed with a cross when down). */
  private drawChip(gfx: Phaser.GameObjects.Graphics, team: number, i: number, c: HudCharacter): void {
    const r = chipRect(team, i);
    this.back?.fillStyle(0x070a12, 0.85).fillRect(r.x - 2, r.y - 2, r.size + 4, r.size + 4);
    const im = this.portraits[TEAMS.length + team * 4 + i];
    this.placePortrait(im, c, r.x, r.y, r.size, team === 1);
    im?.setAlpha(c.dead ? 0.35 : 1);
    const bar = this.view?.actionBar(team);
    const ready = !c.dead && !!bar && bar.swapReadyTick <= bar.tick;
    const pulse = ready && !this.flags.reduceMotion ? 0.6 + 0.4 * Math.abs(((this.flags.frame % 60) - 30) / 30) : 1;
    gfx.lineStyle(this.flags.highContrast || ready ? 3 : 2, c.dead ? 0x777777 : this.flags.highContrast ? 0xffffff : ready ? 0xb39653 : mute(ELEMENT_COLORS[c.element], 0.55, 0.72), ready ? pulse : 0.95);
    gfx.strokeRect(r.x - 2, r.y - 2, r.size + 4, r.size + 4);
    this.drawMark(gfx, c.element, r.x + 8, r.y + r.size - 8, 4);
    if (c.dead) {
      gfx.lineStyle(3, 0xff5a4a, 1);
      gfx.lineBetween(r.x + 4, r.y + 4, r.x + r.size - 4, r.y + r.size - 4);
      gfx.lineBetween(r.x + 4, r.y + r.size - 4, r.x + r.size - 4, r.y + 4);
    }
    const cb = chipBar(team, i);
    this.bars.drawBar(gfx, cb, c, false);
    // The same lost-life ghost as the main bar (a hero hit just before it tagged out keeps its trail on the bench chip).
    this.bars.drawTrail(gfx, cb, c);
  }

  /** Classic buffs: a row of plus or cross squares in the free column under the health words. */
  private drawLegacyBuffs(gfx: Phaser.GameObjects.Graphics, view: RenderView, c: HudCharacter, x: number): void {
    for (const b of collectBuffs(view, c.id, x, this.flags.highContrast)) {
      gfx.lineStyle(this.flags.highContrast ? 2 : 1, this.flags.highContrast ? 0xffffff : 0x111111, 1);
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
    const label = this.labels[team];
    // Portrait phone: the chips stack directly under the name line, beside the big portrait (the bench chips sit further in, so they never meet).
    const phone = isPortraitPlay(this.game);
    const px = Math.round(16 * phoneBoost(this, 2));
    const top = chipRowTop(phone ? Math.max(SLIM_H + PHONE_CHIP_GAP, Math.ceil(this.portraitBottom) + 2) : Math.max(CHIP_Y, SLIM_H + 2, benched ? CHIP_BOTTOM + getChipDrop() : 0), label);
    // The first stunLeft seen after a calm tick is the stun's length (it drains from there); a re-stun that outlasts it raises it.
    const stunLeft = view.arcade()?.stunLeft(c.id) ?? 0;
    this.stunTotals[team] = stunLeft > 0 ? Math.max(this.stunTotals[team] ?? 0, stunLeft) : 0;
    const chips = collectStatusChips(view, team, c.id, c.element, x, this.flags.highContrast, { scale: px / CHIP_FONT, top, ...(phone ? { max: PORTRAIT_CHIP_MAX, perRow: 1, alignRight: team === 1 } : {}) }, this.stunTotals[team]);
    const now = view.tick;
    const reduced = this.flags.reduceMotion;
    const tracker = (this.chipTrackers[team] ??= new StatusTracker<ChipLook>(12));
    const cur = new Map<string, { payload: ChipLook; start: number; expire: number }>();
    for (const chip of chips) cur.set(chip.key, { payload: { x: chip.x, y: chip.y, w: chip.w, h: chip.h, color: chip.color }, start: 0, expire: 0 });
    const rects = this.chipRects(team);
    rects.length = chips.length;
    chips.forEach((chip, i) => (rects[i] = { x: chip.x, y: chip.y, w: chip.w, h: chip.h }));
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
      // Portrait phone: the swell grows down and inward only, so it never climbs into the HUD bar or under the portrait (qa-r98).
      const x = phone ? (team === 1 ? chip.x + chip.w - w : chip.x) : chip.x - (w - chip.w) / 2;
      const y = phone ? chip.y : chip.y - (h - chip.h) / 2;
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
      const icon = id ? (STATUS_LOOKS[Number(id[1])]?.icon ?? CC_ICONS[chip.key]) : chip.key === 'root' ? ROOT_ICON : CC_ICONS[chip.key];
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
      gfx.lineStyle(this.flags.highContrast ? 2 : 1, chip.color, this.flags.highContrast ? 1 : 0.75);
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

  /** The team's published chip rects (one array per team under CHIP_RECTS_KEY, reused every frame). */
  private chipRects(team: number): HudRect[] {
    let all = this.registry.get(CHIP_RECTS_KEY) as HudRect[][] | undefined;
    if (!all) this.registry.set(CHIP_RECTS_KEY, (all = [[], []]));
    return (all[team] ??= []);
  }

  private hideChips(team: number, from: number): void {
    if (from === 0) this.chipRects(team).length = 0;
    for (let i = from; i < CHIP_MAX; i++) this.chipTexts[team * CHIP_MAX + i]?.setVisible(false);
  }

  private get classic(): boolean {
    return !this.arcade && !this.flags.highContrast;
  }

  /** Arcade: the active hero's picture at the end of its health bar (`arcadeAvatar`), in an element-coloured frame. */
  private drawArcadeAvatar(gfx: Phaser.GameObjects.Graphics, team: number, c: HudCharacter): void {
    const a = slimPortrait(team);
    this.back?.fillStyle(0x070a12, 0.78).fillRoundedRect(a.x - 2, a.y - 2, a.size + 4, a.size + 4, 4);
    this.placePortrait(this.portraits[team], c, a.x, a.y, a.size, team === 1);
    gfx.lineStyle(this.flags.highContrast ? 3 : 2, this.flags.highContrast ? 0xffffff : mute(ELEMENT_COLORS[c.element], 0.55, 0.72), 0.9);
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
    gfx.lineStyle(2, this.flags.highContrast ? 0xffffff : mute(ELEMENT_COLORS[c.element], 0.55, 0.72), 0.9);
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
      gfx.lineStyle(2, b.dead ? 0x777777 : this.flags.highContrast ? ELEMENT_COLORS[b.element] : mute(ELEMENT_COLORS[b.element], 0.55, 0.72), 0.9);
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
      .setAlpha(healing && !this.flags.reduceMotion ? criticalPulse(this.time.now, false) * 0.4 + 0.6 : 1)
      .setVisible(true);
    if (t.text !== text) t.setText(text);
  }

  private refreshPrefs(): void {
    const prefs = getPrefs();
    this.flags.highContrast = prefs.highContrast;
    this.flags.reduceMotion = prefs.reduceMotion;
  }

  /** Text multiplier for the slim Arcade HUD: 1 from 1100 CSS px of (1280-box) canvas width up, to PHONE_ARCADE_BOOST (about 12 CSS px of text) on a phone. */
  private arcadeBoost(): number {
    const w = coreDisplayWidth(this);
    return w > 0 ? Math.min(PHONE_ARCADE_BOOST, Math.max(1, 1100 / w)) : 1;
  }

  /** The SUPER label's multiplier: the arcade boost's rule, but allowed past PHONE_ARCADE_BOOST (the label is short, so it can be the bigger text: about 12 CSS px on a 667 px phone). */
  private superBoost(): number {
    const w = coreDisplayWidth(this);
    return w > 0 ? Math.max(1, 1100 / w) : 1;
  }

  /**
   * The life line under the bar, fitted beside the SUPER label. When the name would be cut ("SINDAR...") the SUPER word goes first
   * (the label reads "0%" beside its segments), which usually frees room for the whole name (qa-r84 P5).
   */
  private setSlimLabel(label: Phaser.GameObjects.Text, team: number, name: string, c: HudCharacter, twoVTwo = false, benched = false): void {
    const m = this.meterTexts[team];
    const full = m ? this.meterText(team, false) : '';
    if (m && m.text !== full) m.setText(full);
    this.meterTight[team] = false;
    if (isPortraitPlay(this.game)) {
      this.fitPortraitLabel(label, team, name, c, benched);
      return;
    }
    this.fitSlimLabel(label, team, name, c, twoVTwo);
    if (!m || (!label.text.includes('…') && label.text.includes(name.toUpperCase()))) return;
    this.meterTight[team] = true;
    m.setText(this.meterText(team, true));
    this.fitSlimLabel(label, team, name, c, twoVTwo);
  }

  /**
   * Tall portrait view (qa-r84 P5): the boosted names and SUPER labels are about 35 logical px high and would sit on the bench chips
   * (top 58), so the chips, their bars and the tag pill hang lower by the overlap plus a 4 px gap. Landscape and wide views: 0.
   */
  private dropChips(): void { // QA r105/r106 P2: a 12 px gap (was 4) under the names so the bench chips and TAG word stop crowding the HUD band
    setPhoneHud(isPortraitPlay(this.game));
    if (!isPortraitPlay(this.game)) {
      this.meterRowY = METER_Y + SEGMENT_H / 2;
      setChipDrop(0);
      return;
    }
    // Portrait: the SUPER label gets its own row under the names (both at about 14 CSS px do not fit side by side).
    let bottom = 0;
    for (const l of this.labels) if (l.text !== '') bottom = Math.max(bottom, l.y + l.height);
    const mh = Math.max(0, ...this.meterTexts.map((t) => t?.height ?? 0));
    if (mh > 0) {
      this.meterRowY = portraitMeterRowY(bottom, mh);
      bottom = this.meterRowY + mh / 2;
    }
    this.portraitBottom = bottom;
    setChipDrop(Math.ceil(bottom + PORTRAIT_CHIP_GAP - BENCH_CHIP_Y));
  }

  /** The SUPER label's words: `SUPER 33%`, or just `33%` when the life line needs the room. */
  private meterText(team: number, tight: boolean): string {
    const v = this.arcade?.meters[team]?.value ?? 0;
    return `${tight ? '' : 'SUPER '}${meterLabel(v)}`;
  }

  /** Portrait (qa-r88 P3): "NAME ▲ 286" beside "SUPER 0%" on both sides; the name shrinks in size, then letters, before any word is dropped. */
  private fitPortraitLabel(label: Phaser.GameObjects.Text, team: number, name: string, c: HudCharacter, benched = false): void {
    const k = coreDisplayWidth(this) / 1280;
    const px = phoneFontPx(PORTRAIT_TEXT_PX, k);
    // The SUPER label sits on its own row, so the name only has to stay inside its half (clear of the timer and the pips).
    // 2v2 also has the small TAG word at the pill, so the name stops short of it.
    const edge = benched ? PORTRAIT_NAME_EDGE_TAG : PORTRAIT_NAME_EDGE;
    const clears = (): boolean => (team === 0 ? label.x + label.width <= edge : label.x - label.width >= 1280 - edge);
    label.setFontSize(px);
    for (const t of portraitLifeCandidates(name, c)) {
      label.setText(t);
      if (clears()) return;
    }
  }

  private fitSlimLabel(label: Phaser.GameObjects.Text, team: number, name: string, c: HudCharacter, twoVTwo = false): boolean {
    const base = (label.getData('baseSize') as number | undefined) ?? parseFloat(String(label.style.fontSize));
    label.setData('baseSize', base);
    const clears = (m: Phaser.GameObjects.Text): boolean => (team === 0 ? label.x + label.width + 6 <= m.x - m.width : label.x - label.width - 6 >= m.x + m.width);
    const m = this.meterTexts[team];
    // Phones: drop the word "Life" before shrinking (qa-r29: names read "FI..."), and never shrink below MIN_PHONE_PX effective CSS px.
    const k = coreDisplayWidth(this) / 1280;
    const steps = LIFE_TEXT_SCALES.filter((sc) => base * sc * k >= MIN_PHONE_PX || sc === 1);
    for (const sc of steps) {
      for (const terse of [false, true] as const) {
        label.setFontSize(Math.round(base * sc)).setText(compactLabel(name, c, false, terse));
        if (!m || clears(m)) return true;
      }
    }
    label.setFontSize(Math.round(base * (steps[steps.length - 1] ?? 1)));
    if (!m) return true;
    // QA r39: a bare number ("SINDAROSA 220") does not read as life. Keep "220/220" (current over max) and cut the name first, down to 5 letters ("SINDA...").
    if (twoVTwo) {
      label.setText(compactLabel(name, c, false, 'nomark'));
      if (clears(m)) return true;
      // QA r41: still "SIND..." on a 667 px phone: the whole name beats the last half CSS px of size, so try 10 CSS px before cutting letters.
      if (k > 0) {
        label.setFontSize(Math.ceil(10 / k));
        if (clears(m)) return true;
        label.setFontSize(Math.round(base * (steps[steps.length - 1] ?? 1)));
      }
    }
    for (let max = twoVTwo ? name.length - 1 : 0; max >= MIN_LIFE_NAME; max--) {
      label.setText(compactLabel(shortName(name, max), c, false, true));
      if (clears(m)) return true;
    }
    label.setText(compactLabel(name, c, false, 'bare'));
    if (clears(m)) return true;
    // QA r44: keep the element glyph on both sides: the whole name at 10 CSS px beats a cut name ("SINDARO...") or a dropped mark.
    if (k > 0) {
      label.setFontSize(Math.ceil(10 / k));
      if (clears(m)) return true;
      label.setFontSize(Math.round(base * (steps[steps.length - 1] ?? 1)));
    }
    for (let max = name.length - 1; max >= 3; max--) {
      label.setText(compactLabel(shortName(name, max), c, false, 'bare'));
      if (clears(m)) return true;
    }
    label.setText(compactLabel(name, c, true));
    return clears(m);
  }

  private text(size: number): Phaser.GameObjects.Text {
    return hudText(this, size);
  }

  /**
   * Damage numbers float up (fade in place with reduced motion); combo counters pop at 3/5/8 hits (no pop when reduced);
   * the hyper meters.
   */
  private drawArcade(model: ArcadeHudModel): void {
    const reduced = this.flags.reduceMotion;
    const dim = this.registry.get('tte.banner') === true ? NUMBER_BANNER_ALPHA : 1;
    // World to screen (the arena pans and zooms) in the HUD camera's real frame (wider than 1280 on a wide view), then keep each number
    // on screen, off the combo readout and TAG! call, and clear of the live pops, call-outs and numbers already placed (DMGNUM-1).
    const from = this.arenaView?.();
    const frame = hudFrame(viewWidth(this), this.viewFrame, viewHeight(this));
    this.numbers.collectObstacles(from, frame);
    // Meters first (their texts are part of the ceiling), then the combo counters, then the numbers (which keep clear of the counters).
    const hudAvoid = this.registry.get(HUD_AVOID_KEY) as HudRect[][] | undefined;
    for (const team of TEAMS) this.drawMeter(model, team);
    if (from && !isPhoneHud() && !this.combo.coarse && model.combos.some((c) => c.hits > 0 && c.anchored)) this.combo.buildCeil();
    this.combo.placeAll(model, from, frame, hudAvoid, dim, reduced);
    this.numbers.draw(model, from, frame, dim, this.combo.texts);
    this.combo.publishRects();
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
    const color = this.flags.highContrast ? 0xffffff : METER_COLOR;
    const mid = this.meterRowY;
    const top = mid - SEGMENT_H / 2;
    const alpha = meterFlashAlpha(m, this.flags.reduceMotion);
    for (const seg of meterSegments(m.value, x)) {
      gfx.fillStyle(0x000000, 0.6);
      gfx.fillRect(seg.x, top, SEGMENT_W, SEGMENT_H);
      if (seg.full) {
        gfx.fillStyle(color, alpha);
        gfx.fillRect(seg.x, top, SEGMENT_W, SEGMENT_H);
      } else if (seg.fill > 0) {
        gfx.lineStyle(SEGMENT_H, color, 1);
        for (const [x0, x1] of dashSegments(seg.x, seg.x + seg.fill, CHARGE_DASH)) gfx.lineBetween(x0, mid, x1, mid);
      }
      // Dark then light outline, so the segments read on both bright and dark arenas.
      gfx.lineStyle(3, 0x000000, 1);
      gfx.strokeRect(seg.x, top, SEGMENT_W, SEGMENT_H);
      gfx.lineStyle(this.flags.highContrast ? 2 : 1, 0xffffff, 1);
      gfx.strokeRect(seg.x, top, SEGMENT_W, SEGMENT_H);
    }
    // Full meter (qa-r30, r31): a breathing glow round the segments (steady with reduced motion) and a gold label, so "ready" reads from across the screen.
    const ready = m.full > 0;
    if (ready) {
      const glow = this.flags.highContrast ? 0xffffff : 0xffe28a;
      const breathe = readyGlow(this.time.now, this.flags.reduceMotion);
      for (const [grow, a] of [[9, 0.14], [6, 0.22], [3, 0.34], [1, 0.5]] as const) {
        gfx.lineStyle(2, glow, a * breathe).strokeRect(x - grow, top - grow, METER_W + grow * 2, SEGMENT_H + grow * 2);
      }
    }
    const t = (this.meterTexts[team] ??= this.text(Math.round(12 * Math.min(this.superBoost(), SUPER_LABEL_BOOST)))
      .setOrigin(team === 0 ? 1 : 0, 0.5)
      .setPosition(team === 0 ? x - METER_LABEL_GAP : x + METER_W + METER_LABEL_GAP, mid));
    const portrait = isPortraitPlay(this.game);
    const k = coreDisplayWidth(this) / 1280;
    if (portrait && k > 0) t.setFontSize(phoneFontPx(PORTRAIT_TEXT_PX, k));
    const label = this.meterText(team, this.meterTight[team] === true); // named ("SUPER 0%"), so the segments are not mistaken for the round pips; just "0%" when the life line needs the room
    if (t.text !== label) t.setText(label);
    t.setColor(ready ? (this.flags.highContrast ? '#ffffff' : '#ffe28a') : '#e0d8c6');
    // Phones: the boosted label must not reach the bench portraits under it (qa-r8/r12 open item).
    t.setY(portrait ? mid : meterLabelY(mid, t.height, BENCH_CHIP_Y + getChipDrop(), SLIM_BAR_Y + SLIM_LINE_MAX / 2));
  }

  /** Low-life edge grain; the Arena calls this by name (duck-typed), so it stays on the scene and delegates. */
  edgeGrain(strength: number): void {
    this.chrome.edgeGrain(strength);
  }
}
