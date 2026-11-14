import type Phaser from 'phaser';
import type { Element } from '@core/index';
import { AMBIENT_TEXTURES, AMBIENT_TEX_SIZE, STAGE_AMBIENT_DEPTH, ambientLayers, type AmbientLayer, type AmbientTex } from './stage-ambient';

/**
 * Phaser side of the stage ambient motion (rules in `stage-ambient.ts`): one small set of Phaser 4 ParticleEmitters per
 * stage, behind the fighters, soft generated glow/wisp/grain textures (made once per game). Reduced motion removes the
 * emitters and they come back when the setting is switched off. View only: nothing here touches the sim, and the
 * emitters belong to the scene so they go with it (`destroy` also tears them down at once).
 */
const ARENA_H = 720;
const texKey = (id: AmbientTex): string => `stage-ambient:${id}`;

function ensureTextures(scene: Phaser.Scene): void {
  for (const id of AMBIENT_TEXTURES) {
    const key = texKey(id);
    if (scene.textures.exists(key)) continue;
    const [w, h] = AMBIENT_TEX_SIZE[id];
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex?.getContext();
    if (!tex || !ctx) continue;
    // A soft radial falloff (stretched into an ellipse for the wisp): luminous core, nothing hard-edged.
    ctx.translate(w / 2, h / 2);
    ctx.scale(w / 2, h / 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(id === 'grain' ? 0.7 : 0.35, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    tex.refresh();
  }
}

/** The Phaser emitter config for `l` over a playfield `w` px wide. */
export function ambientEmitterConfig(l: AmbientLayer, w: number): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig {
  const cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
    x: { min: l.x.min * w, max: l.x.max * w },
    y: { min: l.y.min * ARENA_H, max: l.y.max * ARENA_H },
    lifespan: { min: l.lifespan.min, max: l.lifespan.max },
    speedX: { min: l.speedX.min, max: l.speedX.max },
    speedY: { min: l.speedY.min, max: l.speedY.max },
    scale: { start: (l.scale.start.min + l.scale.start.max) / 2, end: (l.scale.end.min + l.scale.end.max) / 2 },
    // Fade in and out around the peak: nothing pops into view.
    alpha: { values: [0, l.alpha, 0] },
    tint: [...l.tint],
    quantity: l.quantity,
    frequency: l.frequency,
    emitting: false,
  };
  if (l.gravityY !== undefined) cfg.gravityY = l.gravityY;
  if (l.additive) cfg.blendMode = 'ADD';
  return cfg;
}

export interface StageAmbient {
  /** Runs (or, with `reduced`, removes) the emitters; cheap to call every frame (acts only when the state changes). */
  update(reduced: boolean): void;
  /** Emitters alive and their live particle total (test probe). */
  state(): { emitters: number; particles: number };
  destroy(): void;
}

export function createStageAmbient(scene: Phaser.Scene, element: Element, playfieldW: number): StageAmbient {
  let emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  const clear = (): void => {
    for (const e of emitters) e.destroy();
    emitters = [];
  };
  return {
    update(reduced): void {
      const layers = ambientLayers(element, reduced);
      if (layers.length === 0) {
        if (emitters.length > 0) clear();
        return;
      }
      if (emitters.length > 0) return;
      ensureTextures(scene);
      for (const l of layers) {
        const e = scene.add.particles(0, 0, texKey(l.tex), ambientEmitterConfig(l, playfieldW)).setDepth(STAGE_AMBIENT_DEPTH);
        e.start(l.advance);
        emitters.push(e);
      }
    },
    state: () => ({ emitters: emitters.length, particles: emitters.reduce((n, e) => n + e.getAliveParticleCount(), 0) }),
    destroy: clear,
  };
}
