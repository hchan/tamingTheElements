import { hash01 } from './grim-fx';

/**
 * Kindrel cast FX (roster24, fire melee), view only: Ember Bite gets a claw-slash arc with a spark burst in front of the caster,
 * Cinder Spray an expanding ring of embers around it. Neither has a sim event on cast, so the view reads a rise of the action-bar
 * slot's `readyTick` (as Fire Heal and Snag do). Pure geometry (no Phaser, no Math.random): reduced motion draws the same shapes
 * held at their mid-life pose, so the cast stays readable without movement.
 */
export const BITE_SPRITE = 'emberBite';
export const SPRAY_SPRITE = 'cinderSpray';
export const BITE_TICKS = 14;
export const SPRAY_TICKS = 30;
export const BITE_COLOR = 0xd2641c;
export const SPRAY_COLOR = 0xc8581a;
export const BITE_POP = 'BITE';
export const SPRAY_POP = 'SPRAY';

export interface BiteFx {
  /** Slash arc polyline, x,y pairs (two fangs side by side). */
  readonly arcs: readonly (readonly number[])[];
  /** Sparks thrown off the bite. */
  readonly sparks: readonly { x: number; y: number; r: number }[];
  readonly alpha: number;
}

/** The bite `age` view ticks after the cast, in front of (x, y) along dir8 `dir` (0 east, 2 north, 4 west, 6 south); undefined once over. */
export function emberBite(x: number, y: number, dir: number, age: number, reduced: boolean): BiteFx | undefined {
  if (age < 0 || age > BITE_TICKS) return undefined;
  const t = reduced ? 0.5 : age / BITE_TICKS;
  const a = (dir * Math.PI) / 4;
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const reach = 46 + 14 * t;
  const arcs: number[][] = [];
  for (const off of [-9, 9]) {
    const pts: number[] = [];
    for (let i = 0; i <= 6; i++) {
      const f = i / 6;
      const sweep = (f - 0.5) * 1.5;
      const rr = reach * (0.55 + 0.45 * Math.sin(f * Math.PI));
      const ang = a + sweep;
      pts.push(x + Math.cos(ang) * rr - dy * off, y - Math.sin(ang) * rr + dx * off);
    }
    arcs.push(pts);
  }
  const sparks: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const ang = a + (hash01(i, 31) - 0.5) * 1.6;
    const d = reach * (0.5 + hash01(i, 32) * 0.5) + t * 22 * (0.5 + hash01(i, 33));
    sparks.push({ x: x + Math.cos(ang) * d, y: y - Math.sin(ang) * d, r: 3.2 * (1 - t * 0.6) });
  }
  return { arcs, sparks, alpha: reduced ? 0.8 : 1 - t * t };
}

export interface SprayFx {
  readonly ring: { x: number; y: number; r: number };
  readonly embers: readonly { x: number; y: number; r: number }[];
  readonly alpha: number;
}

/** The spray ring `age` view ticks after the cast, centred on (x, y); embers ride the ring outwards. Undefined once over. */
export function cinderSpray(x: number, y: number, age: number, reduced: boolean): SprayFx | undefined {
  if (age < 0 || age > SPRAY_TICKS) return undefined;
  const t = reduced ? 0.5 : age / SPRAY_TICKS;
  const r = 22 + 70 * (1 - (1 - t) * (1 - t));
  const embers: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + hash01(i, 41) * 0.4;
    const d = r * (0.85 + hash01(i, 42) * 0.3);
    embers.push({ x: x + Math.cos(ang) * d, y: y - Math.sin(ang) * d - (reduced ? 0 : t * 12), r: 3.5 - t * 1.5 });
  }
  return { ring: { x, y, r }, embers, alpha: reduced ? 0.8 : 1 - t * t };
}
