import type Phaser from 'phaser';
import { HUD_WIDTH } from './bars';
import { SLIM_H, SCRIM_BOTTOM } from './slim-hud';
import { edgeGrainFlecks } from './hud-math';

/** What the chrome needs from the Hud scene: only the Graphics factory (the draw depths are fixed here, below the HUD layers). */
export interface HudChromeContext {
  readonly add: { graphics(): Phaser.GameObjects.Graphics };
}

/** HUD backdrop chrome: the Arcade top scrim (depth 96) and the low-life edge grain (depth 97), both under the HUD layers (98+). */
export class HudChrome {
  private scrim: Phaser.GameObjects.Graphics | undefined;
  private grainGfx: Phaser.GameObjects.Graphics | undefined;

  constructor(private readonly ctx: HudChromeContext) {}

  /** Arcade: a dark top band over the crowd (the terrain owns it), fading out down to the floor. */
  drawScrim(): void {
    const g = this.ctx.add.graphics().setDepth(96);
    g.fillStyle(0x14122a, 0.8).fillRect(0, 0, HUD_WIDTH, SLIM_H + 2);
    // Dense over the crowd band (about y 115-180), a short fade into the floor at about y 182.
    // Lighter and shorter than before: the crowd shows through under the HUD instead of a dead dark band.
    g.fillStyle(0x14122a, 0.38).fillRect(0, SLIM_H + 2, HUD_WIDTH, SCRIM_BOTTOM - SLIM_H - 2);
    for (let i = 0; i < 8; i++) g.fillStyle(0x14122a, 0.34 * (1 - i / 8)).fillRect(0, 100 + i * 8, HUD_WIDTH, 8);
    g.fillStyle(0x0a0818, 0.7).fillRect(0, SLIM_H + 1, HUD_WIDTH, 1);
    this.scrim = g;
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
      const g = this.ctx.add.graphics().setDepth(97);
      for (const f of edgeGrainFlecks()) g.fillStyle(f.color, f.alpha).fillRect(f.x, f.y, 2, 2);
      this.grainGfx = g;
    }
    this.grainGfx.setVisible(true).setAlpha(Math.min(1, strength / 0.45));
  }

  /** Destroy both layers (the scene's shutdown). */
  destroy(): void {
    this.scrim?.destroy();
    this.scrim = undefined;
    this.grainGfx?.destroy();
    this.grainGfx = undefined;
  }
}
