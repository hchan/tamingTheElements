import Phaser from 'phaser';
import type { RenderView } from '@core/index';
import { crisp, fitScene } from '../boot/viewport';
import { getPrefs } from '../platform/a11y/prefs';
import { BUFF_SLOT, collectBuffs } from '../hud/buffs';
import {
  comboAlpha, comboLabel, comboScale, numberAlpha, numberLabel, numberRise, type ArcadeHudModel,
} from '../hud/arcade-hud';
import {
  HUD_WIDTH,
  MAX_COLOR,
  REST_COLOR,
  barFill,
  benchBar,
  collectSide,
  dashSegments,
  healthCue,
  mainBar,
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
  private labels: Phaser.GameObjects.Text[] = [];
  private highContrast = false;
  private reduceMotion = false;
  private frame = 0;
  private arcade: ArcadeHudModel | undefined;
  /** Pooled texts, created on first use: one per damage-number slot and one combo counter per team. */
  private numberTexts: (Phaser.GameObjects.Text | undefined)[] = [];
  private numberSerials: number[] = [];
  private comboTexts: (Phaser.GameObjects.Text | undefined)[] = [];
  private comboKeys: number[] = [];

  constructor() {
    super(HUD_SCENE);
  }

  init(data: HudData): void {
    this.view = data.view;
    this.arcade = data.arcade;
  }

  create(): void {
    fitScene(this);
    this.gfx = this.add.graphics().setDepth(100);
    // One text per side next to the bar: health state in words, so it never depends on red versus green.
    this.labels = TEAMS.map((team) =>
      this.add
        .text(mainBar(sideOffset(team)).minX, 24, '', crisp(this, { fontSize: '16px', color: '#ffffff', fontStyle: 'bold' }))
        .setDepth(101),
    );
    this.refreshPrefs();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.removeAllListeners(Phaser.Scenes.Events.SHUTDOWN);
      this.gfx?.destroy();
      this.gfx = undefined;
      for (const t of [...this.labels, ...this.numberTexts, ...this.comboTexts]) t?.destroy();
      this.labels = [];
      this.numberTexts = [];
      this.numberSerials = [];
      this.comboTexts = [];
      this.comboKeys = [];
      this.view = undefined;
      this.arcade = undefined;
    });
  }

  override update(): void {
    const { view, gfx } = this;
    if (!view || !gfx) return;
    gfx.clear();
    if (++this.frame % PREFS_REFRESH_FRAMES === 0) this.refreshPrefs();
    for (const team of TEAMS) {
      const side = collectSide(view, team);
      const x = sideOffset(team);
      const label = this.labels[team];
      if (side.active) {
        this.drawBar(gfx, mainBar(x), side.active);
        label?.setText(healthCue(side.active.hp / Math.max(1, side.active.maxHp)).text);
        for (const b of collectBuffs(view, side.active.id, x, this.highContrast)) {
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
      } else {
        label?.setText('');
      }
      side.bench.forEach((c, i) => {
        this.drawBar(gfx, benchBar(x, i), c);
      });
    }
    if (this.arcade) this.drawArcade(this.arcade);
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

  /** Damage numbers float up (fade in place with reduced motion); combo counters pop at 3/5/8 hits (no pop when reduced). */
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

  private drawBar(gfx: Phaser.GameObjects.Graphics, g: BarGeometry, c: HudCharacter): void {
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
}
