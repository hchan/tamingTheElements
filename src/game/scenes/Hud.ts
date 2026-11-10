import Phaser from 'phaser';
import type { RenderView } from '@core/index';
import { crisp, fitScene } from '../boot/viewport';
import { getPrefs } from '../platform/a11y/prefs';
import { BUFF_SLOT, collectBuffs } from '../hud/buffs';
import {
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
  private labels: Phaser.GameObjects.Text[] = [];
  private highContrast = false;
  private frame = 0;

  constructor() {
    super(HUD_SCENE);
  }

  init(data: HudData): void {
    this.view = data.view;
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
    this.highContrast = getPrefs().highContrast;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.removeAllListeners(Phaser.Scenes.Events.SHUTDOWN);
      this.gfx?.destroy();
      this.gfx = undefined;
      for (const t of this.labels) t.destroy();
      this.labels = [];
      this.view = undefined;
    });
  }

  override update(): void {
    const { view, gfx } = this;
    if (!view || !gfx) return;
    gfx.clear();
    if (++this.frame % PREFS_REFRESH_FRAMES === 0) this.highContrast = getPrefs().highContrast;
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
