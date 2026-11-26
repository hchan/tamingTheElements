/** Particle layout and DOM for the procedural KO collapse (render only; split out of ko-collapse.ts to stay under the file-size cap). */
export type KoParticleKind = 'ember' | 'dust' | 'spark' | 'ash' | 'droplet' | 'mote' | 'splat';

export interface KoParticleSpec {
  readonly particle: KoParticleKind;
  readonly count: number;
  readonly color: string;
  readonly ms: number;
}

export interface Particle { readonly x: number; readonly dx: number; readonly dy: number; readonly size: number; readonly delay: number }

/** Per kind: horizontal drift, rise (negative = up), size and stagger. Droplets rise then fall back to the base. */
function layout(kind: KoParticleKind, a: number, b: number, i: number): Omit<Particle, 'x'> {
  switch (kind) {
    case 'ember': return { dx: Math.floor(b / 2) - 25, dy: -(50 + b), size: 3 + (b % 3), delay: i * 90 };
    case 'spark': return { dx: Math.floor(b * 0.8) - 40, dy: -(30 + Math.floor(b / 2)), size: 2 + (b % 3), delay: i * 45 };
    case 'ash': return { dx: Math.floor(b / 4) - 12, dy: -(24 + Math.floor(b / 2)), size: 3 + (b % 4), delay: i * 110 };
    case 'droplet': return { dx: (a < 50 ? -1 : 1) * (14 + Math.floor(b / 2)), dy: -(34 + b), size: 4 + (b % 5), delay: i * 30 };
    // Resting kinds: small bright motes drift near the orb, splash blobs sit low and wide around a puddle; both stay in the end frame.
    case 'mote': return { dx: Math.floor(b / 5) - 10, dy: -(14 + Math.floor(b / 2.5)), size: 2 + (b % 3), delay: i * 70 };
    case 'splat': return { dx: 0, dy: 0, size: 6 + (b % 5), delay: i * 60 };
    default: return { dx: (a < 50 ? -1 : 1) * (10 + Math.floor(b / 3)), dy: -(6 + Math.floor(b / 8)), size: 8 + (b % 8), delay: i * 60 };
  }
}

/** Deterministic particle layout (index hash, no randomness): x in percent of the width, drift and rise in px. */
export function koParticles(spec: KoParticleSpec): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < spec.count; i++) {
    const h = Math.imul(i + 1, 2654435761) >>> 0;
    const a = (h >>> 8) % 100;
    const b = (h >>> 16) % 100;
    out.push({ x: (spec.particle === 'splat' ? 4 : 20) + Math.floor(a * (spec.particle === 'splat' ? 0.92 : 0.6)), ...layout(spec.particle, a, b, i) });
  }
  return out;
}

const GLOW: Readonly<Record<KoParticleKind, string>> = {
  ember: 'box-shadow:0 0 6px COLOR;',
  spark: 'box-shadow:0 0 8px 2px COLOR;',
  ash: 'filter:blur(0.5px);',
  droplet: 'box-shadow:inset -1px -1px 2px rgba(0,0,0,0.35);',
  dust: 'filter:blur(3px);',
  mote: 'box-shadow:0 0 6px 2px COLOR;',
  splat: 'box-shadow:inset -1px -1px 2px rgba(0,0,0,0.35);',
};

/** Opacity the resting particles keep in the end frame. */
export const REST_ALPHA = 0.6;

function particleFrames(kind: KoParticleKind, p: Particle): Keyframe[] {
  const at = (x: number, y: number): string => `translate(${String(x)}px, ${String(y)}px)`;
  if (kind === 'droplet') {
    return [
      { transform: at(0, 0), opacity: 0 },
      { transform: at(p.dx / 2, p.dy), opacity: 0.9, offset: 0.4 },
      { transform: at(p.dx, 0), opacity: 0 },
    ];
  }
  if (kind === 'splat') return [{ transform: at(0, -14), opacity: 0 }, { transform: at(0, 0), opacity: REST_ALPHA }];
  if (kind === 'mote') return [{ transform: at(0, 0), opacity: 0 }, { transform: at(p.dx, p.dy), opacity: REST_ALPHA }];
  const peak = kind === 'ember' || kind === 'spark' ? 1 : kind === 'ash' ? 0.7 : 0.5;
  return [
    { transform: at(0, 0), opacity: 0 },
    { transform: at(p.dx / 2, p.dy / 2), opacity: peak, offset: 0.4 },
    { transform: at(p.dx, p.dy), opacity: 0 },
  ];
}

const RESTS = (k: KoParticleKind): boolean => k === 'mote' || k === 'splat';

/** `rest` kinds finish at REST_ALPHA and stay (fill forwards), starting once the collapse is mostly done; `splat` lies at the base line. */
export function particleEl(spec: KoParticleSpec, p: Particle): HTMLElement {
  const d = document.createElement('i');
  d.className = 'matchEndKoParticle';
  d.style.cssText = `position:absolute;bottom:0;left:${String(p.x)}%;width:${String(p.size)}px;height:${String(p.size)}px;border-radius:50%;background:${spec.color};opacity:0;pointer-events:none;${GLOW[spec.particle].replaceAll('COLOR', spec.color)}`;
  const rest = RESTS(spec.particle);
  d.animate(particleFrames(spec.particle, p), { duration: rest ? 500 : spec.ms + (spec.particle === 'spark' ? 0 : 400), delay: rest ? Math.floor(spec.ms * 0.6) + p.delay : p.delay, easing: 'ease-out', fill: rest ? 'both' : 'backwards' });
  return d;
}
