import Phaser from 'phaser';
import type { RenderView } from '@core/index';
import { coreDisplayWidth, fitScene, viewHeight, viewWidth } from '../boot/viewport';
import { heroName } from '../hud/tag-fx';
import { getPrefs } from '../platform/a11y/prefs';
import { hudFrame, HUD_AVOID_KEY, gapLabel, type HudRect, NUMBER_BANNER_ALPHA, type ArcadeHudModel } from '../hud/arcade-hud';
import { benchBar, collectSide, activeHeroText, mainBar, sideOffset } from '../hud/bars';
import { setChipDrop, setPhoneHud, isPhoneHud, slimBar } from '../hud/slim-hud';
import { HudChrome } from '../hud/hud-chrome';
import { newHudFlags } from '../hud/hud-ctx';
import { HudNumbers } from '../hud/hud-numbers';
import { HudCombo } from '../hud/hud-combo';
import { HudBarPainter } from '../hud/hud-bar-painter';
import { HudPortraits } from '../hud/hud-portraits';
import { HudStatusChips } from '../hud/hud-status-chips';
import { HudClassicRow } from '../hud/hud-classic-row';
import { HudLifeRow } from '../hud/hud-life-row';
import type { ComboProbe } from '../platform/test-hook';

export const HUD_SCENE = 'Hud';

export interface HudData {
  readonly view: RenderView;
  /** Arcade matches only: damage numbers and combo counters, fed and aged by the Arena. */
  readonly arcade?: ArcadeHudModel;
  /** Arcade: the Arena camera's world view (from scroll and zoom), so world-space damage numbers can be projected to the screen. */
  readonly arenaView?: () => HudRect;
}

const TEAMS = [0, 1] as const;

/** Frames between re-reads of the accessibility prefs (the OS media queries are not free per frame). */
const PREFS_REFRESH_FRAMES = 30;

/**
 * Top HUD, a scene that runs in parallel with Arena. Each frame it reads the RenderView and redraws;
 * it holds no rules: it never kills a character or writes to the sim.
 */
export class Hud extends Phaser.Scene {
  private view: RenderView | undefined;
  private gfx: Phaser.GameObjects.Graphics | undefined;
  private back: Phaser.GameObjects.Graphics | undefined;
  private readonly chrome = new HudChrome(this);
  private readonly flags = newHudFlags();
  private readonly bars = new HudBarPainter(this, this.flags);
  private readonly portraitView = new HudPortraits(this, this.flags, this.bars, () => this.back);
  private readonly classicRow = new HudClassicRow(this, this.flags);
  private readonly statusChips = new HudStatusChips(this, this.flags, { label: (team) => this.lifeRow.labels[team], portraitBottom: () => this.lifeRow.portraitBottom });
  private arcade: ArcadeHudModel | undefined;
  private readonly lifeRow = new HudLifeRow(this, this.flags, () => this.arcade);
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
      for (const t of this.lifeRow.labels) fn(t);
      for (const t of this.lifeRow.meterTexts) fn(t);
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
    this.lifeRow.createLabels(!!this.arcade);
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
      this.lifeRow.destroy();
      this.classicRow.destroy();
      this.statusChips.destroy();
      this.numbers.destroy();
      this.combo.destroy();
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
    return this.lifeRow.labels.map((t) => t.text);
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
    if (this.arcade) this.lifeRow.dropChips();
    for (const team of TEAMS) {
      const side = collectSide(view, team);
      this.benchCount[team] = side.bench.length;
      const x = sideOffset(team);
      const label = this.lifeRow.labels[team];
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
          if (label) this.lifeRow.setSlimLabel(label, team, heroName(side.active.sprite), side.active, true, side.bench.length > 0); // QA r105 P2: every fight keeps "cur/max" on a tight phone (was 2v2 only: 1v1 fell to a bare number)
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
      this.lifeRow.matchLifeFormat();
      this.drawArcade(this.arcade);
    }
  }

  private get classic(): boolean {
    return !this.arcade && !this.flags.highContrast;
  }

  private refreshPrefs(): void {
    const prefs = getPrefs();
    this.flags.highContrast = prefs.highContrast;
    this.flags.reduceMotion = prefs.reduceMotion;
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
    if (this.gfx) for (const team of TEAMS) this.lifeRow.drawMeter(this.gfx, model, team);
    if (from && !isPhoneHud() && !this.combo.coarse && model.combos.some((c) => c.hits > 0 && c.anchored)) this.combo.buildCeil();
    this.combo.placeAll(model, from, frame, hudAvoid, dim, reduced);
    this.numbers.draw(model, from, frame, dim, this.combo.texts);
    this.combo.publishRects();
  }


  /** Low-life edge grain; the Arena calls this by name (duck-typed), so it stays on the scene and delegates. */
  edgeGrain(strength: number): void {
    this.chrome.edgeGrain(strength);
  }
}
