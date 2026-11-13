import type { RenderView } from '@core/index';
import type { SoundId } from '../assets/keys';
import manifest from '../assets/manifest.generated.json';

/** Ability sprites whose legacy cast sound has a different name (read from the legacy `abilities.js`). */
const ALIAS: Readonly<Record<string, SoundId>> = {
  windCone: 'laser1',
  icicles: 'freezing',
  fireBlast: 'fireBreath',
  fireball: 'fireBreath',
  hurlRock: 'rockBullet',
  groundShock: 'rockBullet',
  tornado: 'whoosh',
  translucentFlame: 'flame',
  shardsOfIce: 'iceShard',
  circusOfSlimeIcon: 'circusOfSlime',
  fade: 'fadeOut',
};

const IDS: ReadonlySet<string> = new Set(manifest.sounds.map((s) => s.id));

/** The legacy cast sound of an ability, or undefined when it has none (Capture has its own event cues). */
export function castSoundFor(sprite: string): SoundId | undefined {
  if (sprite === 'capture' || sprite === '') return undefined;
  const id = ALIAS[sprite] ?? sprite;
  return IDS.has(id) ? id : undefined;
}

/**
 * Spots ability casts from the action bars (view side, so the sim and its hashes are untouched): a slot whose ready tick moved
 * forward was just used. The first sight of a slot only records it, so a swap or a match start is silent.
 */
export class CastDetector {
  private readonly seen = new Map<string, number>();

  detect(view: RenderView): SoundId[] {
    return this.detectCasts(view).map((c) => c.id);
  }

  /** As `detect`, with the casting team (for the elemental cue). */
  detectCasts(view: RenderView): { id: SoundId; team: number }[] {
    const out: { id: SoundId; team: number }[] = [];
    for (const team of [0, 1]) {
      const bar = view.actionBar(team);
      if (!bar) continue;
      bar.abilities.forEach((slot, i) => {
        const key = `${String(team)}:${String(i)}:${slot.sprite}`;
        const prev = this.seen.get(key);
        this.seen.set(key, slot.readyTick);
        if (prev === undefined || slot.readyTick <= prev) return;
        const id = castSoundFor(slot.sprite);
        if (id) out.push({ id, team });
      });
    }
    return out;
  }
}
