import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { EntityFlag, StatusId, type RenderCharacter, type RenderView } from '@core/index';
import {
  CharacterView, FLASH_FILL_FRAMES, MAX_HOLD_FRAMES, FLASH_TINT_FRAMES, FROZEN_TINT, JITTER_PX, flipForDir, frameSetFor, lerp,
  tintStage, frozenTintOf, FLASH_WASH_ALPHA, FLASH_TAIL_ALPHA, flashWashAlpha, liftToWhite,
} from './character-view';

/** Chainable fake of the Phaser Image calls CharacterView makes; records the tint and position. */
interface FakeImage {
  tint: number;
  mode: number;
  x: number;
  [method: string]: unknown;
}
function fakeImage(): FakeImage {
  const img: FakeImage = { tint: 0xffffff, mode: 0, x: 0 };
  Object.assign(img, {
    setTint: (c: number) => { img.tint = c; return img; },
    setTintMode: (m: number) => { img.mode = m; return img; },
    clearTint: () => { img.tint = 0xffffff; img.mode = 0; return img; },
    setPosition: (x: number) => { img.x = x; return img; },
  });
  for (const m of ['setOrigin', 'setVisible', 'setDisplaySize', 'setFlipX', 'setAlpha', 'setFrame', 'setTexture', 'destroy']) {
    img[m] = () => img;
  }
  return img;
}

describe('CharacterView hit flash and jitter (V6)', () => {
  const char = (flags: number): RenderCharacter => ({
    id: 1, team: 1, sprite: 'no-such-sprite', dir: 0, flags, x: 100, y: 50, px: 100, py: 50, w: 80, h: 80, hp: 1, maxHp: 1,
    restCap: 1, element: 'fire',
  });
  const make = (): { view: CharacterView; img: FakeImage } => {
    const img = fakeImage();
    const scene = { add: { image: () => img } } as unknown as Phaser.Scene;
    return { view: new CharacterView(scene), img };
  };
  
  it('counts rendered frames, holds while paused, beats the frozen tint and clears it after; the sprite is never flash-tinted', () => {
    const { view, img } = make();
    const frozen = char(EntityFlag.alive | EntityFlag.frozen);
    view.apply(frozen, 0, 1);
    expect(img.tint).toBe(FROZEN_TINT);
    view.flash(0x123456);
    view.apply(frozen, 0, 1, false);
    const seen = [view.washAlpha];
    for (let f = 0; f < 11; f++) {
      view.apply(frozen, 0, 1);
      seen.push(view.washAlpha);
    }
    expect(seen.slice(0, 3)).toEqual([FLASH_WASH_ALPHA, FLASH_WASH_ALPHA, FLASH_WASH_ALPHA]);
    expect(seen[seen.length - 1]).toBe(0);
    expect(img.tint).toBe(FROZEN_TINT);
    expect(img.mode).toBe(0);
    expect(view.element).toBe('fire');
    view.flash(0x123456);
    for (let f = 0; f < 11; f++) view.apply(char(EntityFlag.alive), 0, 1);
    expect(img.tint).toBe(0xffffff);
  });

  it('jitters by 2 px on alternate frames until the freeze deadline, and a parked view forgets it', () => {
    const { view, img } = make();
    const c = char(EntityFlag.alive);
    view.jitter(10);
    const xs: number[] = [];
    for (const tick of [8, 9, 9, 10]) {
      view.apply(c, tick, 1);
      xs.push(img.x);
    }
    expect(xs).toEqual([100 - JITTER_PX, 100 + JITTER_PX, 100 - JITTER_PX, 100]);
    view.jitter(10);
    view.hide();
    view.apply(c, 9, 1);
    expect(img.x).toBe(100);
  });

  it('a heavy hit holds the wash for its hold frames (view-only hit-stop), capped, then fades out', () => {
    const { view } = make();
    const c = char(EntityFlag.alive);
    view.flash(0x123456, 3);
    const seen: number[] = [];
    for (let f = 0; f < 14; f++) {
      view.apply(c, 0, 1);
      seen.push(view.washAlpha);
    }
    expect(seen.slice(0, 5).every((a) => a === FLASH_WASH_ALPHA)).toBe(true);
    expect(seen[13]).toBe(0);
    view.flash(0x123456, 999);
    for (let f = 0; f < MAX_HOLD_FRAMES + FLASH_FILL_FRAMES + FLASH_TINT_FRAMES + 2; f++) view.apply(c, 0, 1);
    expect(view.washAlpha).toBe(0);
  });

  it('the flash is a soft additive overlay: the sprite keeps its own shading and is never tinted', () => {
    const { view, img } = make();
    view.flash(0x123456);
    view.apply(char(EntityFlag.alive), 0, 1);
    expect(view.washAlpha).toBeGreaterThan(0);
    expect(img.tint).toBe(0xffffff);
  });

  it('flashWashAlpha is full while held, fades linearly to 0, and liftToWhite lightens', () => {
    expect(flashWashAlpha(FLASH_FILL_FRAMES + FLASH_TINT_FRAMES)).toBe(FLASH_WASH_ALPHA);
    expect(flashWashAlpha(FLASH_TINT_FRAMES)).toBe(FLASH_TAIL_ALPHA);
    expect(flashWashAlpha(0)).toBe(0);
    expect(flashWashAlpha(4)).toBeCloseTo(FLASH_TAIL_ALPHA / 2);
    expect(liftToWhite(0x000000)).toBeGreaterThan(0x000000);
    expect(liftToWhite(0xffffff)).toBe(0xffffff);
  });
});

describe('character view helpers', () => {
  it('picks reels by facing and flips west-ish', () => {
    expect(frameSetFor(0)).toBe('right');
    expect(frameSetFor(4)).toBe('left');
    expect(frameSetFor(6)).toBe('up');
    expect(frameSetFor(2)).toBe('down');
    expect(flipForDir(4)).toBe(true);
    expect(flipForDir(0)).toBe(false);
  });
  it('lerps', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
  });
  it('hit flash (V6): white fill for 2 frames, then the hit tint for 8, over the frozen tint, then frozen or none', () => {
    const stages = (frozen: boolean): string[] => {
      const out: string[] = [];
      for (let left = FLASH_FILL_FRAMES + FLASH_TINT_FRAMES; left >= 0; left--) out.push(tintStage(left, frozen));
      return out;
    };
    expect(stages(false)).toEqual(['wash', 'wash', ...Array<string>(8).fill('hit'), 'none']);
    expect(stages(true)).toEqual(['wash', 'wash', ...Array<string>(8).fill('hit'), 'frozen']);
  });
});

describe('frozen tint (CA1): only a Classic Tornado victim, never a casting melee hero', () => {
  const viewWith = (ids: number[]): RenderView => ({ forEachStatus: (_id: number, v: (s: { id: number }) => void) => { for (const id of ids) v({ id }); } }) as unknown as RenderView;
  const img = (): { view: CharacterView; img: FakeImage } => {
    const i = fakeImage();
    return { view: new CharacterView({ add: { image: () => i } } as unknown as Phaser.Scene), img: i };
  };
  const caster: RenderCharacter = { id: 1, team: 1, sprite: 'no-such-sprite', dir: 0, flags: EntityFlag.alive | EntityFlag.frozen, x: 0, y: 0, px: 0, py: 0, w: 80, h: 80, hp: 1, maxHp: 1, restCap: 1, element: 'fire' };

  it('frozenTintOf: Classic Tornado status yes; frozen flag alone (cast recovery) no; Arcade never', () => {
    expect(frozenTintOf(viewWith([StatusId.tornado]), 1, false)).toBe(true);
    expect(frozenTintOf(viewWith([StatusId.iceBlast]), 1, false)).toBe(false);
    expect(frozenTintOf(viewWith([]), 1, false)).toBe(false);
    expect(frozenTintOf(viewWith([StatusId.tornado]), 1, true)).toBe(false);
  });

  it('a melee caster in cast recovery (frozen flag, no Tornado status) is not tinted; a Tornado victim is', () => {
    const { view, img: im } = img();
    view.apply(caster, 0, 1, true, frozenTintOf(viewWith([]), 1, true));
    expect(im.tint).toBe(0xffffff);
    view.apply(caster, 1, 1, true, frozenTintOf(viewWith([]), 1, false));
    expect(im.tint).toBe(0xffffff);
    view.apply(caster, 2, 1, true, frozenTintOf(viewWith([StatusId.tornado]), 1, false));
    expect(im.tint).toBe(FROZEN_TINT);
    view.apply(caster, 3, 1, true, false);
    expect(im.tint).toBe(0xffffff);
  });
});


describe('CharacterView attachments follow the drawn body (WALL-3a)', () => {
  interface Fake { x: number; y: number; [m: string]: unknown }
  const make = (fit: boolean): { view: CharacterView; made: Fake[] } => {
    const made: Fake[] = [];
    const scene = {
      textures: { exists: (k: string) => /glow/i.test(k), get: () => ({ has: () => true, add: () => undefined }) },
      add: {
        image: (): Fake => {
          const f: Fake = { x: 0, y: 0, depth: 0, texture: { key: 'glow' } };
          for (const m of ['setTint', 'setAlpha', 'setBlendMode', 'setTexture', 'setVisible', 'setDepth', 'setDisplaySize', 'setOrigin', 'setTintMode', 'clearTint', 'setFlipX', 'setFrame']) f[m] = () => f;
          f['setPosition'] = (x: number, y: number): Fake => { f.x = x; f.y = y; return f; };
          made.push(f);
          return f;
        },
      },
    } as unknown as Phaser.Scene;
    return { view: new CharacterView(scene, 1, fit), made };
  };
  const at = (x: number): RenderCharacter => ({
    id: 1, team: 0, sprite: 'echo', dir: 0, flags: 0, x, y: 380, px: x, py: 380, w: 80, h: 80, hp: 1, maxHp: 1, restCap: 1, element: 'air',
  });
  for (const [x, centre] of [[0, 80], [1840, 1840], [800, 840]] as const) {
    it(`glow, halo, aura and shadow centre on the tucked body at x=${String(x)}`, () => {
      const { view, made } = make(true);
      view.apply(at(x), 0, 1);
      const [body, ...rest] = made;
      expect(body?.x).toBe(centre - 80);
      expect(rest.length).toBeGreaterThanOrEqual(4);
      for (const a of rest) expect(a.x).toBe(centre);
    });
  }
  it('Classic (not fit) keeps the sim-x anchors', () => {
    const { view, made } = make(false);
    view.apply(at(0), 0, 1);
    expect(made.slice(1).some((a) => a.x !== 0)).toBe(true);
  });
});
