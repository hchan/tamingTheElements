import Phaser from 'phaser';
import { manifestToLoadList } from '../assets/load-list';
import { ACTION_SHEET } from '../hud/action-bar';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, fitScene } from '../boot/viewport';

export const PRELOAD_READY = 'preload-ready';

/**
 * Loads every manifest asset with a progress bar, then emits PRELOAD_READY on the game events.
 * Audio unlock is left to Phaser's WebAudio manager (first touch/click/keydown); we never block on it.
 */
export class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    fitScene(this);
    const width = LOGICAL_WIDTH;
    const height = LOGICAL_HEIGHT;
    const barW = width / 2;
    const x = (width - barW) / 2;
    const y = height / 2;
    this.add.rectangle(x + barW / 2, y, barW + 4, 24).setStrokeStyle(2, 0xffffff);
    const bar = this.add.rectangle(x, y, 0, 18, 0xffffff).setOrigin(0, 0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      bar.width = barW * p;
    });

    for (const e of manifestToLoadList(import.meta.env.BASE_URL)) {
      if (e.kind === 'image') this.load.image(e.key, e.url);
      else this.load.audio(e.key, [e.url]);
    }
    // The generated action-bar icon sheet (tools/assets/hud-gen/actions.py), outside the manifest.
    this.load.image(ACTION_SHEET, `${import.meta.env.BASE_URL}assets/img/hud/actions.png`);
  }

  create(): void {
    this.game.events.emit(PRELOAD_READY);
  }
}
