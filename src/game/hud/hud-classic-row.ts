import type Phaser from 'phaser';
import { benchBar, criticalPulse, regenLabel, regenState, sideOffset, type HudCharacter } from './bars';
import { hudText, type HudFlags } from './hud-ctx';
import { regenAnchor } from './hud-math';

/** The Classic bench rows' regen words (pooled per row: index team * 4 + row). */
export class HudClassicRow {
  private regenTexts: (Phaser.GameObjects.Text | undefined)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly flags: HudFlags,
  ) {}

  destroy(): void {
    for (const t of this.regenTexts) t?.destroy();
    this.regenTexts = [];
  }

  /** Hides the regen words of the bench rows from `from` up to 4 (rows the team no longer has). */
  hideFrom(team: number, from: number): void {
    for (let i = from; i < 4; i++) this.regenTexts[team * 4 + i]?.setVisible(false);
  }

  /** Regen text for a bench row: the live +N/s while healing, `rested` at the cap. Right of the player's bars, left of the enemy's. */
  drawRegenText(team: number, row: number, c: HudCharacter): void {
    const slot = team * 4 + row;
    const text = regenLabel(c);
    if (text === '') {
      this.regenTexts[slot]?.setVisible(false);
      return;
    }
    const g = benchBar(sideOffset(team), row);
    const at = regenAnchor(team, g);
    const t = this.regenTexts[slot] ?? hudText(this.scene, 16).setOrigin(team === 0 ? 0 : 1, 0.5);
    this.regenTexts[slot] = t;
    const healing = regenState(c) === 'healing';
    t.setPosition(at.x, at.y)
      .setColor(healing ? '#9dffa0' : '#c8d0e0')
      .setAlpha(healing && !this.flags.reduceMotion ? criticalPulse(this.scene.time.now, false) * 0.4 + 0.6 : 1)
      .setVisible(true);
    if (t.text !== text) t.setText(text);
  }
}
