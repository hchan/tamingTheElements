import type Phaser from 'phaser';

/** Camera shake decays quadratically with its progress instead of holding its strength and stopping dead. */
export class ShakeDecay {
  private shaking = false;
  private shakeX = 0;
  private shakeY = 0;

  update(scene: Phaser.Scene): void {
    const fx = scene.cameras.main.shakeEffect;
    if (!fx.isRunning) {
      this.shaking = false;
      return;
    }
    if (!this.shaking) {
      this.shaking = true;
      this.shakeX = fx.intensity.x;
      this.shakeY = fx.intensity.y;
    }
    const k = 1 - fx.progress;
    fx.intensity.set(this.shakeX * k * k, this.shakeY * k * k);
  }
}
