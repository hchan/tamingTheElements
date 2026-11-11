import type Phaser from 'phaser';
import { sheetKey, type FrameResolver, type SheetFrame } from '../assets/sheet-frames';
import type { Action } from '../assets/sheet-spec';

/**
 * The sprite sheets the pose layer draws from (FUN-DESIGN 2.16 step 3, view side). Loads `sheet:<sprite>` lazily, the
 * first time a character of the match is seen, and only when the manifest has an atlas for it: with no atlases (today)
 * nothing is ever requested and every frame stays on the legacy art. Textures live in the game's texture manager, so a
 * later match with the same character reuses them.
 */
export class SheetBook {
  private readonly wanted = new Set<string>();
  private readonly ready = new Set<string>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly res: FrameResolver,
    /** Vite `BASE_URL` (the atlas URLs are relative to `<base>assets/`). */
    private readonly base: string,
  ) {}

  /** Starts loading `sprite`'s atlas if it has one (once per sprite). */
  want(sprite: string): void {
    if (this.wanted.has(sprite)) return;
    this.wanted.add(sprite);
    const url = this.res.sheetUrl(sprite);
    if (url === undefined) return;
    const key = sheetKey(sprite);
    const register = (): void => {
      if (!this.scene.textures.exists(key)) return;
      const tex = this.scene.textures.get(key);
      for (const { name, rect } of this.res.frames(sprite)) if (!tex.has(name)) tex.add(name, 0, rect.x, rect.y, rect.w, rect.h);
      this.ready.add(sprite);
    };
    if (this.scene.textures.exists(key)) {
      register();
      return;
    }
    this.scene.load.once(`filecomplete-image-${key}`, register);
    this.scene.load.image(key, `${this.base}assets/${url}`);
    this.scene.load.start();
  }

  /** The sheet frame for `sprite` doing `action`, or undefined while its atlas is not loaded or the row falls back to legacy. */
  frame(sprite: string, action: Action, dir8: number, t: number): SheetFrame | undefined {
    if (!this.ready.has(sprite)) return undefined;
    const r = this.res.resolveFrame(sprite, action, dir8, t);
    return r.source === 'legacy' ? undefined : r;
  }

  has(sprite: string): boolean {
    return this.ready.has(sprite);
  }

  /** Sprites whose atlas is loaded (test probe). */
  get loaded(): string[] {
    return [...this.ready].sort();
  }
}
