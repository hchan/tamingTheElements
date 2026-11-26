import { cutinFlagOn, heroReleased } from './cutin-gate';

/**
 * Procedural KO for the Versus result screen (art-director spec; rig-only stills failed review): the loser's upright Large portrait
 * (public/assets/img/map/<hero>Large.png) collapses at its base instead of swapping to a still. Fiara burns down (scaleY about 0.5,
 * dark ember tint, a few rising embers); Cyclonius settles into a spent heap (scaleY 0.55, scaleX 1.25, alpha 0.6, grey-blue, no
 * spin, base dust). Render only (Web Animations on the DOM, no sim state, no Math.random); released heroes always, else behind
 * `?ff=roster24` in dev/test builds. The portrait is fetched when the screen shows; a failed load keeps the face.
 */
export interface KoCollapseSpec {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly alpha: number;
  /** CSS filter at the end state (the DOM equivalent of the Phaser tint). */
  readonly filter: string;
  readonly ms: number;
  /** Particles: rising embers or base dust. */
  readonly particle: 'ember' | 'dust';
  readonly count: number;
  readonly color: string;
}

export const KO_COLLAPSE: Readonly<Record<string, KoCollapseSpec>> = {
  fiara: { scaleX: 1, scaleY: 0.5, alpha: 1, filter: 'brightness(0.6) sepia(1) saturate(2.2) hue-rotate(-18deg)', ms: 900, particle: 'ember', count: 9, color: '#ff8a2a' },
  cyclonius: { scaleX: 1.25, scaleY: 0.55, alpha: 0.6, filter: 'grayscale(0.55) sepia(0.25) hue-rotate(180deg) brightness(0.85)', ms: 900, particle: 'dust', count: 7, color: '#8899aa' },
};

export const koCollapseUrl = (base: string, hero: string): string => `${base.endsWith('/') ? base : `${base}/`}assets/img/map/${hero}Large.png`;

/** The spec when `hero` lost (`lost`) and is released or the flag is on, else null. */
export function koCollapseFor(hero: string, lost: boolean, search: string, devBuild: boolean): KoCollapseSpec | null {
  // Fiara and Cyclonius are legacy heroes (always released), so no flag is needed; a roster24 slug added later is gated like the other fx.
  const legacy = hero === 'fiara' || hero === 'cyclonius';
  return lost && Object.hasOwn(KO_COLLAPSE, hero) && (legacy || heroReleased(hero) || cutinFlagOn(search, devBuild)) ? (KO_COLLAPSE[hero] ?? null) : null;
}

/** Keyframes of the portrait: base pinned (the caller sets transform-origin bottom); reduced motion jumps to the end state. */
export function koCollapseFrames(spec: KoCollapseSpec, reduced: boolean): Keyframe[] {
  const end = { transform: `scale(${String(spec.scaleX)}, ${String(spec.scaleY)})`, filter: spec.filter, opacity: spec.alpha };
  const from = { transform: 'scale(1, 1)', filter: 'none', opacity: 1 };
  if (reduced) return [{ ...end, offset: 0 }, { ...end, offset: 1 }];
  return [{ ...from, offset: 0 }, { ...end, offset: 1 }];
}

export interface Particle { readonly x: number; readonly dx: number; readonly dy: number; readonly size: number; readonly delay: number }

/** Deterministic particle layout (index hash, no randomness): x in percent of the width, drift and rise in px. */
export function koParticles(spec: KoCollapseSpec): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < spec.count; i++) {
    const h = Math.imul(i + 1, 2654435761) >>> 0;
    const a = (h >>> 8) % 100;
    const b = (h >>> 16) % 100;
    const ember = spec.particle === 'ember';
    out.push({
      x: 20 + Math.floor(a * 0.6),
      dx: ember ? Math.floor(b / 2) - 25 : (a < 50 ? -1 : 1) * (10 + Math.floor(b / 3)),
      dy: ember ? -(50 + b) : -(6 + Math.floor(b / 8)),
      size: ember ? 3 + (b % 3) : 8 + (b % 8),
      delay: i * (ember ? 90 : 60),
    });
  }
  return out;
}

function particleEl(spec: KoCollapseSpec, p: Particle): HTMLElement {
  const d = document.createElement('i');
  d.className = 'matchEndKoParticle';
  d.style.cssText = `position:absolute;bottom:0;left:${String(p.x)}%;width:${String(p.size)}px;height:${String(p.size)}px;border-radius:50%;background:${spec.color};opacity:0;pointer-events:none;${spec.particle === 'ember' ? `box-shadow:0 0 6px ${spec.color};` : 'filter:blur(3px);'}`;
  d.animate(
    [
      { transform: 'translate(0, 0)', opacity: 0 },
      { transform: `translate(${String(p.dx / 2)}px, ${String(p.dy / 2)}px)`, opacity: spec.particle === 'ember' ? 1 : 0.5, offset: 0.4 },
      { transform: `translate(${String(p.dx)}px, ${String(p.dy)}px)`, opacity: 0 },
    ],
    { duration: spec.ms + 400, delay: p.delay, easing: 'ease-out', fill: 'backwards' },
  );
  return d;
}

/** Swaps the loser card's face for the collapsing portrait once it has loaded. `side` 'main' = `.matchEndMain`, 'side' = `.matchEndSide`. */
export function applyKoCollapse(root: HTMLElement, hero: string, side: 'main' | 'side', spec: KoCollapseSpec, url: string, reduced: boolean): void {
  const img = new Image();
  img.onload = () => {
    const face = root.querySelector<HTMLElement>(`.${side === 'main' ? 'matchEndMain' : 'matchEndSide'} .matchEndFace`);
    if (!face?.isConnected) return;
    const stage = document.createElement('div');
    stage.className = 'matchEndKoCollapse';
    stage.dataset['hero'] = hero;
    stage.setAttribute('aria-hidden', 'true');
    stage.style.cssText = 'position:relative;width:min(220px,50vw);aspect-ratio:1;';
    img.className = 'matchEndKoPortrait';
    img.alt = '';
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;transform-origin:50% 100%;filter:drop-shadow(0 6px 10px rgba(0,0,0,0.6))';
    stage.append(img);
    face.replaceWith(stage);
    if (typeof img.animate !== 'function') return;
    img.animate(koCollapseFrames(spec, reduced), { duration: reduced ? 1 : spec.ms, easing: 'ease-in', fill: 'forwards' });
    if (!reduced) for (const p of koParticles(spec)) stage.append(particleEl(spec, p));
  };
  img.src = url;
}

/** Entry for the result screen: does nothing unless the gate passes. */
export function showKoCollapse(root: HTMLElement, hero: string, side: 'main' | 'side', lost: boolean, search: string, devBuild: boolean, base: string): void {
  const spec = koCollapseFor(hero, lost, search, devBuild);
  if (spec) applyKoCollapse(root, hero, side, spec, koCollapseUrl(base, hero), window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
