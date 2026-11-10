import Phaser from 'phaser';
import { CinematicRunner, type CinematicScript, type CinematicSink, type Rect, type TweenTarget } from '../cinematics/runner';
import { INTRO_SCRIPT } from '../cinematics/scripts';
import { counted, teardown } from '../platform/test-hook';

export const CINEMATIC_SCENE = 'Cinematic';

export interface CinematicLaunch {
  readonly script: CinematicScript;
  readonly onEnd?: (skipped: boolean) => void;
}

const TEXT_STYLE = { fontSize: '32px', align: 'center', color: '#ffffff', wordWrap: { width: 1000 } };

/**
 * Plays a data-driven cinematic script. The runner decides what happens; this scene only draws it with
 * Phaser tweens (cosmetic time, never the sim). Every listener is removed on shutdown or game destroy.
 */
export class Cinematic extends Phaser.Scene {
  private launch: CinematicLaunch | undefined;
  private runner: CinematicRunner | undefined;
  private cleanups: (() => void)[] = [];
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private header: Phaser.GameObjects.Text | undefined;
  private caption: Phaser.GameObjects.Text | undefined;
  private finished = false;

  constructor() {
    super(CINEMATIC_SCENE);
  }

  init(data?: CinematicLaunch): void {
    this.launch = data ?? { script: INTRO_SCRIPT };
    this.finished = false;
  }

  create(): void {
    const { width, height } = this.scale;
    this.header = this.add.text(width / 2, 80, '', { ...TEXT_STYLE, fontSize: '56px' }).setOrigin(0.5).setDepth(10);
    this.caption = this.add.text(width / 2, height - 140, '', TEXT_STYLE).setOrigin(0.5).setDepth(10);
    const skip = this.add
      .text(width - 24, 24, 'Skip', { fontSize: '28px', color: '#ffff88' })
      .setOrigin(1, 0)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });
    skip.on(Phaser.Input.Events.POINTER_DOWN, () => { this.runner?.skip(); });

    const win = counted(window);
    const onKey = (): void => { this.runner?.key(); };
    win.addEventListener('keydown', onKey);
    this.cleanups.push(() => { win.removeEventListener('keydown', onKey); });

    // Game destroy (exit-to-menu) emits DESTROY rather than SHUTDOWN on a running scene; handle both once.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.onShutdown(); });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => { this.onShutdown(); });

    this.installProbe();
    this.runner = new CinematicRunner(this.launch?.script ?? INTRO_SCRIPT, this.sink());
  }

  override update(_time: number, delta: number): void {
    this.runner?.advance(delta);
  }

  private sink(): CinematicSink {
    return {
      background: (key) => {
        const { width, height } = this.scale;
        if (this.textures.exists(key)) this.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(width, height).setDepth(-1);
      },
      header: (text) => { this.header?.setText(text); },
      headerDone: () => { this.header?.setText(''); },
      caption: (text) => { this.caption?.setText(text); },
      sprite: (id, key, r, alpha) => {
        if (!this.textures.exists(key)) return;
        const img = this.add.image(r.x + r.w / 2, r.y + r.h / 2, key).setDisplaySize(r.w, r.h).setAlpha(alpha);
        this.sprites.set(id, img);
      },
      tween: (id, to, ms) => { this.tweenSprite(id, to, ms); },
      done: (skipped) => {
        this.finished = true;
        this.launch?.onEnd?.(skipped);
        // With no owner callback the demo simply leaves the scene.
        if (!this.launch?.onEnd) this.scene.stop();
      },
    };
  }

  private tweenSprite(id: string, to: TweenTarget, ms: number): void {
    const img = this.sprites.get(id);
    if (!img) return;
    const props: Record<string, number> = {};
    if (to.alpha !== undefined) props['alpha'] = to.alpha;
    if (to.spin !== undefined) props['angle'] = img.angle + to.spin;
    const r: Partial<Rect> = to;
    if (r.w !== undefined) props['displayWidth'] = r.w;
    if (r.h !== undefined) props['displayHeight'] = r.h;
    if (r.x !== undefined) props['x'] = r.x + (r.w ?? img.displayWidth) / 2;
    if (r.y !== undefined) props['y'] = r.y + (r.h ?? img.displayHeight) / 2;
    this.tweens.add({ targets: img, duration: ms, ...props });
  }

  /** Test-build-only hook (statically removed from production builds). */
  private installProbe(): void {
    if (!(import.meta.env.DEV || import.meta.env.MODE === 'test')) return;
    const hook = window.__TTE__;
    if (!hook) return;
    hook.scene = CINEMATIC_SCENE;
    const isFinished = (): boolean => this.finished;
    hook.cinematic = {
      get finished() {
        return isFinished();
      },
      skip: () => { this.runner?.skip(); },
      destroyGame: () => {
        const game = this.game;
        const done = new Promise<void>((resolve) => {
          game.events.once('destroy', () => { resolve(); });
        });
        teardown.settled = Promise.all([teardown.settled, done]).then(() => undefined);
        game.destroy(true);
      },
    };
  }

  private onShutdown(): void {
    for (const off of this.cleanups.splice(0)) off();
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      const hook = window.__TTE__;
      if (hook) {
        delete hook.cinematic;
        delete hook.scene;
      }
    }
    this.events.removeAllListeners(Phaser.Scenes.Events.SHUTDOWN);
    this.events.removeAllListeners(Phaser.Scenes.Events.DESTROY);
    this.tweens.killAll();
    this.sprites.clear();
    this.runner = undefined;
    this.header = undefined;
    this.caption = undefined;
  }
}
