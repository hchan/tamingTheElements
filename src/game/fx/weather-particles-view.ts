import type Phaser from 'phaser';
import { WEATHER_TEXTURES, activeLayers, texturePixels, TEX_SIZE, type Range, type WeatherLayer, type WeatherTex } from './weather-particles';

/**
 * Phaser side of the weather particle art pass (view only; pure rules and tables in `weather-particles.ts`): per element
 * weather a few Phaser 4 ParticleEmitters of grim, muted, textured particles (smoke and fog haze, ash and embers, rain
 * splashes and mist, dust, grit and dry leaves, wind streaks) over a small set of generated grey textures. Haze sits
 * behind the fighters, flecks in front. They ride the weather view's sky-tint fade (`setFade`) and are torn down when the
 * weather changes or ends; with reduced motion nothing is made. Textures are made once per game (canvas textures keep
 * the deterministic noise of `texturePixels`); emitters live in the Arena and go with it.
 */

const BACK_DEPTH = -0.6;
const FRONT_DEPTH = 2.2;
const ARENA_H = 720;
const texKey = (id: WeatherTex): string => `weather:${id}`;

/** Makes the generated textures once (they live in the game's texture manager, shared across scenes). */
function ensureTextures(scene: Phaser.Scene): void {
  for (const id of WEATHER_TEXTURES) {
    const key = texKey(id);
    if (scene.textures.exists(key)) continue;
    const [w, h] = TEX_SIZE[id];
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex?.getContext();
    if (!tex || !ctx) continue;
    const data = ctx.createImageData(w, h);
    data.data.set(texturePixels(id));
    ctx.putImageData(data, 0, 0);
    tex.refresh();
  }
}

const mid = (r: Range): number => (r.min + r.max) / 2;

/** The Phaser emitter config for `l` over a playfield `w` px wide. */
export function emitterConfig(l: WeatherLayer, w: number): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig {
  const cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
    x: { min: l.x.min * w, max: l.x.max * w },
    y: { min: l.y.min * ARENA_H, max: l.y.max * ARENA_H },
    lifespan: { min: l.lifespan.min, max: l.lifespan.max },
    speedX: { min: l.speedX.min, max: l.speedX.max },
    speedY: { min: l.speedY.min, max: l.speedY.max },
    scale: { start: mid(l.scale.start), end: mid(l.scale.end) },
    alpha: { start: l.alpha.start, end: l.alpha.end },
    tint: [...l.tint],
    quantity: l.quantity,
    frequency: l.frequency,
    emitting: false,
  };
  if (l.gravityY !== undefined) cfg.gravityY = l.gravityY;
  if (l.angle !== undefined) cfg.rotate = l.angle;
  else if (l.rotate) cfg.rotate = { min: -180, max: 180 };
  return cfg;
}

export interface WeatherParticles {
  /** Runs the emitters for weather `kind` (0 none) at once, or stops and clears them; no-op when `kind` is unchanged. */
  set(kind: number, reduced: boolean, playfieldW: number): void;
  /** The sky-tint fade, 0..1, applied to every emitter's alpha. */
  setFade(fade: number): void;
  /** Emitters currently alive (test probe). */
  count(): number;
  destroy(): void;
}

export function createWeatherParticles(scene: Phaser.Scene): WeatherParticles {
  let emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  let current = 0;
  let fade = 1;
  const clear = (): void => {
    for (const e of emitters) e.destroy();
    emitters = [];
  };
  return {
    set(kind, reduced, w): void {
      const layers = activeLayers(kind, reduced);
      const want = layers.length === 0 ? 0 : kind;
      if (want === current) return;
      current = want;
      clear();
      if (want === 0) return;
      ensureTextures(scene);
      for (const l of layers) {
        const e = scene.add.particles(0, 0, texKey(l.tex), emitterConfig(l, w)).setDepth(l.depth === 'back' ? BACK_DEPTH : FRONT_DEPTH).setAlpha(fade);
        e.start(l.advance);
        emitters.push(e);
      }
    },
    setFade(f): void {
      if (f === fade) return;
      fade = f;
      for (const e of emitters) e.setAlpha(f);
    },
    count: () => emitters.length,
    destroy: clear,
  };
}
