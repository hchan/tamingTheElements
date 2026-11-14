import type Phaser from 'phaser';
import {
  CROWD_FACTOR, CROWD_H, FAR_FACTOR, FAR_H, FLY_FACTOR, STAGE_TEXTURE, STAGE_URL, WALL_Y,
  ROUSE_MS, atlasFrames, crowdFrame, crowdHop, crowdIndex, farFrame, flyFrame, flyIndex, flyOffset, layerX,
  type RouseKind,
} from './terrain-stage-layout';

/**
 * The Street Fighter style stage backdrop of the Arcade arena (view only). A band above the tile floor (the floor starts at
 * the wall, `WALL_Y`): the stage element's skyline, two ambient drifters (bats, gulls, hawks, kite-birds) and a crowd of the
 * element's own folk that cheers in a rolling wave. Each layer follows only part of the camera's pan (`*_FACTOR`, parallax),
 * so the far sky slides slower than the near crowd, which slides slower than the world. One lazily loaded atlas
 * (`stagebg.png`, tools/assets/stage-gen/stagebg.py), four Images and nothing allocated per frame. Reduced motion: the
 * crowd and drifters hold still (frame 0, fixed spots); the parallax only follows the camera, which has its own reduced
 * motion easing.
 */

/** Drifter heights (world y): in the sky over the back tiers (the crowd strip starts at WALL_Y - CROWD_H = 56, just under the Hud bars). */
const FLY_Y = [60, 82] as const;
/** Between the hero's backdrop (-0.95) and the tile floor (-0.8). */
const FAR_DEPTH = -0.92;
const FLY_DEPTH = -0.91;
const CROWD_DEPTH = -0.9;

export interface StageBackdrop {
  /** Draws stage `stage` (0 none) for a camera centred on world x `centerX`; `ms` is view time, `still` reduced motion. */
  update(stage: number, centerX: number, ms: number, still: boolean): void;
  /** The crowd reacts (hops, cheers twice as fast) to a hit, a super or a KO at view time `ms`; a smaller one does not cut a bigger one short. */
  rouse(kind: RouseKind, ms: number): void;
  /** The stage drawn and the crowd frame shown (test probe); stage 0 before the atlas loads. */
  readonly stage: number;
  readonly crowd: number;
  destroy(): void;
}

export function mountStageBackdrop(scene: Phaser.Scene, base: string): StageBackdrop {
  let far: Phaser.GameObjects.Image | undefined;
  let crowd: Phaser.GameObjects.Image | undefined;
  let flyers: Phaser.GameObjects.Image[] = [];
  let framed = false;
  let shown = 0;
  let crowdNow = 0;
  let rouseKind: RouseKind = 'hit';
  let rouseAt = Number.NEGATIVE_INFINITY;
  if (!scene.textures.exists(STAGE_TEXTURE)) {
    scene.load.image(STAGE_TEXTURE, `${base.endsWith('/') ? base : `${base}/`}assets/${STAGE_URL}`);
    scene.load.start();
  }

  const build = (): void => {
    const tex = scene.textures.get(STAGE_TEXTURE);
    for (const f of atlasFrames()) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    framed = true;
    far = scene.add.image(0, WALL_Y - FAR_H, STAGE_TEXTURE, farFrame(1)).setOrigin(0, 0).setDepth(FAR_DEPTH);
    flyers = FLY_Y.map((y) => scene.add.image(0, y, STAGE_TEXTURE, flyFrame(1, 0)).setOrigin(0, 0.5).setDepth(FLY_DEPTH));
    crowd = scene.add.image(0, WALL_Y - CROWD_H, STAGE_TEXTURE, crowdFrame(1, 0)).setOrigin(0, 0).setDepth(CROWD_DEPTH);
  };

  return {
    update(stage, centerX, ms, still): void {
      if (stage > 0 && !framed && scene.textures.exists(STAGE_TEXTURE)) build();
      const on = stage > 0 && framed;
      far?.setVisible(on);
      crowd?.setVisible(on);
      for (const f of flyers) f.setVisible(on);
      if (!on || !far || !crowd) {
        shown = 0;
        return;
      }
      shown = stage;
      const age = ms - rouseAt;
      crowdNow = crowdIndex(ms, still, age >= 0 && age < ROUSE_MS[rouseKind]);
      far.setFrame(farFrame(stage)).setX(layerX(centerX, FAR_FACTOR));
      crowd.setFrame(crowdFrame(stage, crowdNow)).setX(layerX(centerX, CROWD_FACTOR)).setY(WALL_Y - CROWD_H - crowdHop(age, rouseKind, still));
      flyers.forEach((f, i) => {
        f.setFrame(flyFrame(stage, flyIndex(ms, i, still))).setX(layerX(centerX, FLY_FACTOR) + flyOffset(ms, i, still));
      });
    },
    rouse(kind, ms): void {
      if (ROUSE_MS[kind] < ROUSE_MS[rouseKind] - (ms - rouseAt)) return;
      rouseKind = kind;
      rouseAt = ms;
    },
    get stage(): number {
      return shown;
    },
    get crowd(): number {
      return crowdNow;
    },
    destroy(): void {
      for (const o of [far, crowd, ...flyers]) o?.destroy();
      far = crowd = undefined;
      flyers = [];
    },
  };
}
