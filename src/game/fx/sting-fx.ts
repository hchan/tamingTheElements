import type Phaser from 'phaser';
import { arcadeHeroScale, visualBox } from '../views/hero-scale';
import { arcadePlayfield, type RenderView } from '@core/index';

/**
 * Stinging Filament cast FX (roster24, wind), view only: a fan of thin violet lines shot along the caster's aim, drawn with a
 * Phaser particle emitter (the ability stays procedural, no art asset: the line texture is generated). There is no sim event
 * on cast, so the view reads a rise of the action-bar slot's `readyTick` (as Snag and Kindrel do). Reduced motion: a narrower
 * fan of three lines.
 */
export const STING_SPRITE = 'stingingFilament';
export const STING_TEX = 'stingLine';
export const STING_COLOR = 0xa070e0;
export const STING_COUNT = 7;
export const STING_SPREAD_DEG = 36;
const DEPTH = 6.2;
const BENCHED_OR_DEAD = 16 | 32;

/**
 * Phaser particle angles (degrees, 0 = east, clockwise on screen) of a fan of `count` rays centred on dir8 `dir` (0 east,
 * 2 north, 4 west, 6 south) and `spreadDeg` wide in total. One ray points straight along the aim when `count` is odd.
 */
export function stingFanAngles(dir: number, count: number, spreadDeg: number): number[] {
  const centre = -dir * 45;
  if (count <= 1) return [centre];
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(centre + (i / (count - 1) - 0.5) * spreadDeg);
  return out;
}

/** The cast facing: the 8-way aim in Arcade (where the filament actually flies), else the 4-way facing. */
export function stingCastDir(arcade: { aim(id: number): number } | undefined, c: { id: number; dir: number }): number {
  return arcade ? arcade.aim(c.id) : c.dir;
}

export function mountStingFx(arena: Phaser.Scene, view: RenderView, reduceMotion: () => boolean): void {
  let emitter: Phaser.GameObjects.Particles.ParticleEmitter | undefined;
  const lastReady = new Map<number, number>();
  let lastRound = -1;
  let queue: number[] = [];
  let cur = 0;

  const build = (): Phaser.GameObjects.Particles.ParticleEmitter => {
    if (!arena.textures.exists(STING_TEX)) {
      const g = arena.make.graphics({}, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 44, 3);
      g.generateTexture(STING_TEX, 44, 3);
      g.destroy();
    }
    // `rotate` runs before `angle` on emit, so it takes the next ray and `angle` reuses it; each line lies along its own flight.
    return arena.add
      .particles(0, 0, STING_TEX, {
        emitting: false,
        lifespan: 260,
        speed: { min: 420, max: 620 },
        tint: STING_COLOR,
        alpha: { start: 1, end: 0 },
        scaleX: { start: 1, end: 0.35 },
        blendMode: 'ADD',
        rotate: { onEmit: () => (cur = queue.shift() ?? 0) },
        angle: { onEmit: () => cur },
      })
      .setDepth(DEPTH);
  };

  const tick = (): void => {
    const round = view.arcade()?.round ?? 0;
    if (round !== lastRound) {
      lastReady.clear();
      lastRound = round;
    }
    for (const team of [0, 1]) {
      const slot = view.actionBar(team)?.abilities.find((s) => s.sprite === STING_SPRITE);
      if (!slot) continue;
      const prev = lastReady.get(team);
      lastReady.set(team, slot.readyTick);
      if (prev === undefined || slot.readyTick <= prev) continue;
      view.forEachCharacter((c) => {
        if (c.team !== team || (c.flags & BENCHED_OR_DEAD) !== 0) return;
        const vb = visualBox(c.x, c.y, c.w, c.h, view.arcade() ? arcadeHeroScale(c.h) : 1, { x: 0, y: 0, w: 0, h: 0 }, view.arcade() ? arcadePlayfield().w : undefined);
        queue = stingFanAngles(stingCastDir(view.arcade(), c), reduceMotion() ? 3 : STING_COUNT, STING_SPREAD_DEG);
        emitter ??= build();
        emitter.explode(queue.length, vb.x + vb.w / 2, vb.y + vb.h / 2);
      });
    }
  };

  const off = (): void => {
    arena.events.off('postupdate', tick).off('shutdown', off).off('destroy', off);
    emitter?.destroy();
    emitter = undefined;
  };
  arena.events.on('postupdate', tick);
  arena.events.once('shutdown', off).once('destroy', off);
}
