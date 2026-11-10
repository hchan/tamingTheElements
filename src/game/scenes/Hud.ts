import Phaser from 'phaser';
import type { RenderView } from '@core/index';
import { BUFF_SLOT, collectBuffs } from '../hud/buffs';
import {
  MAX_COLOR,
  REST_COLOR,
  barFill,
  benchBar,
  collectSide,
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

/**
 * Top HUD, a scene that runs in parallel with Arena. Each frame it reads the RenderView and redraws;
 * it holds no rules: it never kills a character or writes to the sim.
 */
export class Hud extends Phaser.Scene {
  private view: RenderView | undefined;
  private gfx: Phaser.GameObjects.Graphics | undefined;

  constructor() {
    super(HUD_SCENE);
  }

  init(data: HudData): void {
    this.view = data.view;
  }

  create(): void {
    this.gfx = this.add.graphics().setDepth(100);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.removeAllListeners(Phaser.Scenes.Events.SHUTDOWN);
      this.gfx?.destroy();
      this.gfx = undefined;
      this.view = undefined;
    });
  }

  override update(): void {
    const { view, gfx } = this;
    if (!view || !gfx) return;
    gfx.clear();
    for (const team of TEAMS) {
      const side = collectSide(view, team);
      const x = sideOffset(team);
      if (side.active) {
        this.drawBar(gfx, mainBar(x), side.active);
        for (const b of collectBuffs(view, side.active.id, x)) {
          gfx.lineStyle(1, 0x111111, 1);
          gfx.strokeRect(b.x, b.y, BUFF_SLOT, BUFF_SLOT);
          // Remaining-time fill: the slot drains as the status runs out.
          const remain = (1 - b.elapsed) * BUFF_SLOT;
          gfx.fillStyle(b.color, 1);
          gfx.fillRect(b.x, b.y + BUFF_SLOT - remain, BUFF_SLOT, remain);
        }
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
    stroke(g.lineMax, MAX_COLOR, g.maxX);
    if (c.dead) return;
    const fill = barFill(g, c.hp, c.maxHp, c.restCap);
    stroke(g.line, REST_COLOR, fill.restX);
    if (c.hp > 0) stroke(g.line, fill.color, fill.curX);
  }
}
