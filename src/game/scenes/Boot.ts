import Phaser from 'phaser';

/** First scene. The sim loop is fixed-step and independent of Phaser's delta, so this only renders. */
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
}
