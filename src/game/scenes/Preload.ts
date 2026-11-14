import Phaser from 'phaser';
import { manifestToLoadList } from '../assets/load-list';
import { ACTION_SHEET } from '../hud/action-bar';
import { PAINT_TEXTURE, PAINT_URL, STAGE_TEXTURE, STAGE_URL, TILE_TEXTURE, TILE_URL } from './launch';
import { PRELOAD_READY } from './launch';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, fitScene } from '../boot/viewport';

export { PRELOAD_READY };

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

    // The key art is queued first and goes up behind the bar as soon as it lands, so the loading screen is never a bare black bar.
    const base = import.meta.env.BASE_URL;
    this.load.image('loadart', `${base}assets/img/menu/keyart.webp`);
    this.load.once(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}image-loadart`, () => {
      const art = this.add.image(width / 2, height / 2, 'loadart').setDepth(-10).setAlpha(0.85);
      art.setScale(Math.max(width / art.width, height / art.height));
    });

    for (const e of manifestToLoadList(import.meta.env.BASE_URL)) {
      if (e.kind === 'image') this.load.image(e.key, e.url);
      else this.load.audio(e.key, [e.url]);
    }
    // The generated action-bar icon sheet (tools/assets/hud-gen/actions.py), outside the manifest.
    this.load.image(ACTION_SHEET, `${import.meta.env.BASE_URL}assets/img/hud/actions.png`);
    // The stage art (skyline and crowd, painted floor, floor details) is loaded here, before the bar ends, so the arena never shows
    // a bare dark floor that the art then pops into; the terrain view finds the textures present and skips its own lazy load.
    for (const [key, url] of [[STAGE_TEXTURE, STAGE_URL], [PAINT_TEXTURE, PAINT_URL], [TILE_TEXTURE, TILE_URL]] as const) this.load.image(key, `${import.meta.env.BASE_URL}assets/${url}`);
  }

  create(): void {
    this.game.events.emit(PRELOAD_READY);
  }
}
