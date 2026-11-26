import { cutinFlagOn, heroReleased } from './cutin-gate';
import { type KoParticleKind, koParticles, particleEl } from './ko-collapse-particles';

export { koParticles };

/**
 * Procedural KO for the Versus result screen (art-director spec; rig-only stills failed review): the loser's upright Large portrait
 * (public/assets/img/map/<hero>Large.png) collapses at its base instead of swapping to a still. Fiara burns down (scaleY about 0.5,
 * dark ember tint, a few rising embers); Cyclonius settles into a spent heap (scaleY 0.55, scaleX 1.25, alpha 0.6, grey-blue, no
 * spin, base dust); Wispera fizzles and sparks out, Lavax cools to ash, Morblass splashes then pools. Render only (Web Animations on the DOM, no sim state, no Math.random); released heroes always, else behind
 * `?ff=roster24` in dev/test builds. The portrait is fetched when the screen shows; a failed load keeps the face.
 */
export interface KoCollapseSpec {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly alpha: number;
  /** CSS filter at the end state (the DOM equivalent of the Phaser tint). */
  readonly filter: string;
  readonly ms: number;
  /** Optional middle frame (offset `at`, 0..1) before the end state, e.g. a splash that rises before the puddle. */
  readonly mid?: { readonly at: number; readonly scaleX: number; readonly scaleY: number; readonly alpha: number };
  /** Particles: rising embers, base dust, sparks, ash flakes or splash droplets. */
  readonly particle: KoParticleKind;
  readonly count: number;
  readonly color: string;
}

export const KO_COLLAPSE: Readonly<Record<string, KoCollapseSpec>> = {
  fiara: { scaleX: 1, scaleY: 0.5, alpha: 1, filter: 'brightness(0.6) sepia(1) saturate(2.2) hue-rotate(-18deg)', ms: 900, particle: 'ember', count: 9, color: '#ff8a2a' },
  cyclonius: { scaleX: 1.25, scaleY: 0.55, alpha: 0.6, filter: 'grayscale(0.55) sepia(0.25) hue-rotate(180deg) brightness(0.85)', ms: 900, particle: 'dust', count: 7, color: '#8899aa' },
  // Wispera: the orb flickers, shrinks and sparks out (the mid dip is the fizzle). Lavax: cools to grey ash and slumps. Morblass: a splash up, then a wide puddle.
  wispera: { scaleX: 0.7, scaleY: 0.35, alpha: 0.35, filter: 'brightness(0.55) saturate(0.6)', ms: 1000, mid: { at: 0.35, scaleX: 0.95, scaleY: 0.9, alpha: 0.7 }, particle: 'spark', count: 12, color: '#bfe8ff' },
  lavax: { scaleX: 1.05, scaleY: 0.6, alpha: 0.9, filter: 'grayscale(0.95) brightness(0.55) contrast(0.9)', ms: 1400, particle: 'ash', count: 10, color: '#6e6a66' },
  morblass: { scaleX: 1.5, scaleY: 0.25, alpha: 0.75, filter: 'brightness(0.8) saturate(0.9)', ms: 1000, mid: { at: 0.3, scaleX: 1.1, scaleY: 1.12, alpha: 1 }, particle: 'droplet', count: 11, color: '#4aa3d8' },
};

/** Legacy heroes are always released, so no flag gates them; later roster24 slugs added to the table are gated like the other fx. */
export const KO_COLLAPSE_LEGACY: ReadonlySet<string> = new Set(['fiara', 'cyclonius', 'wispera', 'lavax', 'morblass']);

export const koCollapseUrl = (base: string, hero: string): string => `${base.endsWith('/') ? base : `${base}/`}assets/img/map/${hero}Large.png`;

/** The spec when `hero` lost (`lost`) and is released or the flag is on, else null. */
export function koCollapseFor(hero: string, lost: boolean, search: string, devBuild: boolean): KoCollapseSpec | null {
  const legacy = KO_COLLAPSE_LEGACY.has(hero);
  return lost && Object.hasOwn(KO_COLLAPSE, hero) && (legacy || heroReleased(hero) || cutinFlagOn(search, devBuild)) ? (KO_COLLAPSE[hero] ?? null) : null;
}

/** Keyframes of the portrait: base pinned (the caller sets transform-origin bottom); reduced motion jumps to the end state. */
export function koCollapseFrames(spec: KoCollapseSpec, reduced: boolean): Keyframe[] {
  const end = { transform: `scale(${String(spec.scaleX)}, ${String(spec.scaleY)})`, filter: spec.filter, opacity: spec.alpha };
  const from = { transform: 'scale(1, 1)', filter: 'none', opacity: 1 };
  if (reduced) return [{ ...end, offset: 0 }, { ...end, offset: 1 }];
  const m = spec.mid;
  const mid = m ? [{ transform: `scale(${String(m.scaleX)}, ${String(m.scaleY)})`, filter: spec.filter, opacity: m.alpha, offset: m.at }] : [];
  return [{ ...from, offset: 0 }, ...mid, { ...end, offset: 1 }];
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
