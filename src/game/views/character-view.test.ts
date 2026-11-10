import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { EntityFlag, type RenderCharacter } from '@core/index';
import {
  CharacterView, FLASH_FILL_FRAMES, FLASH_TINT_FRAMES, FROZEN_TINT, JITTER_PX, flipForDir, frameIndex, frameSetFor, lerp,
  tintStage,
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
  const shown = (img: FakeImage): string => `${img.tint.toString(16)}/${String(img.mode)}`;

  it('counts rendered frames, holds while paused, beats the frozen tint and restores it after', () => {
    const { view, img } = make();
    const frozen = char(EntityFlag.alive | EntityFlag.frozen);
    view.apply(frozen, 0, 1);
    expect(img.tint).toBe(FROZEN_TINT);
    view.flash(0x123456);
    view.apply(frozen, 0, 1, false);
    const seen = [shown(img)];
    for (let f = 0; f < 7; f++) {
      view.apply(frozen, 0, 1);
      seen.push(shown(img));
    }
    expect(seen).toEqual(['ffffff/1', 'ffffff/1', 'ffffff/1', '123456/0', '123456/0', '123456/0', '123456/0', '88ccff/0']);
    expect(view.element).toBe('fire');
    view.flash(0x123456);
    for (let f = 0; f < 7; f++) view.apply(char(EntityFlag.alive), 0, 1);
    expect(shown(img)).toBe('ffffff/0');
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
  it('animates only while moving', () => {
    expect(frameIndex(100, 4, false)).toBe(0);
    expect(frameIndex(6, 4, true)).toBe(1);
    expect(frameIndex(24, 4, true)).toBe(0);
    expect(frameIndex(5, 0, true)).toBe(0);
  });
  it('lerps', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
  });
  it('hit flash (V6): white fill for 2 frames, then the hit tint for 4, over the frozen tint, then frozen or none', () => {
    const stages = (frozen: boolean): string[] => {
      const out: string[] = [];
      for (let left = FLASH_FILL_FRAMES + FLASH_TINT_FRAMES; left >= 0; left--) out.push(tintStage(left, frozen));
      return out;
    };
    expect(stages(false)).toEqual(['fill', 'fill', 'hit', 'hit', 'hit', 'hit', 'none']);
    expect(stages(true)).toEqual(['fill', 'fill', 'hit', 'hit', 'hit', 'hit', 'frozen']);
  });
});
