import Phaser from 'phaser';
import type { RenderView } from '@core/index';
import { coreDisplayWidth, crisp, fitScene, phoneBoost, viewHeight, viewWidth } from '../boot/viewport';
import { heroName } from '../hud/tag-fx';
import { getPrefs } from '../platform/a11y/prefs';
import {
  CHARGE_DASH, hudFrame, METER_W, METER_Y, SEGMENT_H, SEGMENT_W, meterLabel, meterFlashAlpha, readyGlow,
  HUD_AVOID_KEY, gapLabel, type HudRect, meterLabelY, meterSegments, meterX, NUMBER_BANNER_ALPHA, type ArcadeHudModel,
} from '../hud/arcade-hud';
import {
  benchBar,
  collectSide,
  dashSegments,
  activeHeroText,
  mainBar,
  sideOffset,
  type HudCharacter,
} from '../hud/bars';
import {
  CHIP_Y as BENCH_CHIP_Y, getChipDrop, setChipDrop, setPhoneHud, SLIM_BAR_Y, SLIM_LINE_MAX, isPhoneHud, compactLabel, portraitLifeCandidates, shortName, slimBar, SLIM_ROW_B,
} from '../hud/slim-hud';
import { HudChrome } from '../hud/hud-chrome';
import { HUD_FONT, hudText, newHudFlags } from '../hud/hud-ctx';
import { HudNumbers } from '../hud/hud-numbers';
import { HudCombo } from '../hud/hud-combo';
import { HudBarPainter } from '../hud/hud-bar-painter';
import { HudPortraits } from '../hud/hud-portraits';
import { HudStatusChips } from '../hud/hud-status-chips';
import { HudClassicRow } from '../hud/hud-classic-row';
import { phoneFontPx, portraitMeterRowY } from '../hud/hud-math';
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
  private readonly chrome = new HudChrome(this);
  private readonly flags = newHudFlags();
  private readonly bars = new HudBarPainter(this, this.flags);
  private readonly portraitView = new HudPortraits(this, this.flags, this.bars, () => this.back);
  private readonly classicRow = new HudClassicRow(this, this.flags);
  private readonly statusChips = new HudStatusChips(this, this.flags, { label: (team) => this.labels[team], portraitBottom: () => this.portraitBottom });
  private arcade: ArcadeHudModel | undefined;
  private meterTexts: (Phaser.GameObjects.Text | undefined)[] = [];
  /** Centre y of the SUPER segments and label: the plain METER_Y row, or a second row under the names in portrait play (set by `dropChips`). */
  /** Portrait play: the lowest logical y of the names and the SUPER row (the status chips start under it). */
  private portraitBottom = 0;
  private meterRowY = METER_Y + SEGMENT_H / 2;
  private readonly meterTight: boolean[] = [false, false];
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
    this.portraitView.create();
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
      this.portraitView.destroy();
      for (const t of [...this.labels, ...this.meterTexts]) t?.destroy();
      this.classicRow.destroy();
      this.statusChips.destroy();
      this.labels = [];
      this.numbers.destroy();
      this.combo.destroy();
      this.meterTexts = [];
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
        if (this.arcade) this.portraitView.drawArcadeAvatar(gfx, team, side.active);
        else this.portraitView.drawPortrait(gfx, team, side.active, side.bench);
        if (this.arcade) this.statusChips.drawStatusChips(gfx, this.view, team, side.active, x, side.bench.length > 0);
        else this.statusChips.drawLegacyBuffs(gfx, view, side.active, x);
      } else {
        if (this.arcade) {
          // K.O. gap: keep the last hero's name greyed over an empty bar, instead of a blank label (qa-r64/r65).
          const last = this.lastActive[team];
          label?.setText(gapLabel(last, false)).setAlpha(0.6);
          if (last) this.bars.drawEmptyBar(gfx, slimBar(team), last.maxHp);
        } else label?.setText('');
        this.statusChips.hideChips(team, 0);
        this.portraitView.hideTeam(team);
      }
      side.bench.forEach((c, i) => {
        if (this.arcade) {
          this.portraitView.drawChip(gfx, this.view, team, i, c);
          return;
        }
        this.bars.drawBar(gfx, benchBar(x, i), c, false);
        if (this.classic) this.classicRow.drawRegenText(team, i, c);
      });
      this.classicRow.hideFrom(team, side.bench.length);
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

  private get classic(): boolean {
    return !this.arcade && !this.flags.highContrast;
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
