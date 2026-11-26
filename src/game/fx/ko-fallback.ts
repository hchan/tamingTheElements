import { cutinFlagOn, heroReleased } from './cutin-gate';

/**
 * Procedural KO for roster24 heroes with no approved KO art (none now: all 14 approved heroes have KO stills, see fx/ko-still; add a slug only while a hero has no KO art). In the arena the sprite already gets the generic `koFall` slump (pose-math); on the Versus
 * result screen the losing hero's portrait card slumps, desaturates and dims the same way. Render only (Web Animations on the
 * DOM, no sim state, no randomness), for released heroes always, else behind `?ff=roster24` in dev/test builds like the victory still. Other heroes keep the plain card.
 */
export const KO_FALLBACK_HEROES: ReadonlySet<string> = new Set<string>();

export const KO_FALLBACK_MS = 800;

/** Whether `hero` (the loser) gets the fallback: it lost, has no KO art, and it is released or the flag is on. */
export const koFallbackFor = (hero: string, lost: boolean, search: string, devBuild: boolean): boolean =>
  lost && KO_FALLBACK_HEROES.has(hero) && (heroReleased(hero) || cutinFlagOn(search, devBuild));

/** Keyframes: desaturate and dim, and (unless `reduced`) slump sideways and sink; the end state holds. Reduced motion changes colour only. */
export function koFallbackFrames(reduced: boolean): Keyframe[] {
  const end = 'grayscale(1) brightness(0.55)';
  const from = 'grayscale(0) brightness(1)';
  if (reduced) return [{ filter: from, offset: 0 }, { filter: end, offset: 1 }];
  return [
    { transform: 'rotate(0deg) translateY(0)', filter: from, opacity: 1, offset: 0 },
    { transform: 'rotate(-14deg) translateY(10px)', filter: 'grayscale(0.6) brightness(0.8)', opacity: 1, offset: 0.6 },
    { transform: 'rotate(-18deg) translateY(16px)', filter: end, opacity: 0.8, offset: 1 },
  ];
}

/** Plays the KO on the loser's portrait. `side` is the card: 'main' (`.matchEndMain`) or 'side' (`.matchEndSide`). */
export function applyKoFallback(root: HTMLElement, hero: string, side: 'main' | 'side', reduced: boolean): void {
  const face = root.querySelector<HTMLElement>(`.${side === 'main' ? 'matchEndMain' : 'matchEndSide'} .matchEndFace`);
  if (!face || typeof face.animate !== 'function') return;
  face.dataset['koFallback'] = hero;
  face.animate(koFallbackFrames(reduced), { duration: KO_FALLBACK_MS, easing: 'ease-in', fill: 'forwards' });
}

/** Entry for the result screen: does nothing unless the gate passes. */
export function showKoFallback(root: HTMLElement, hero: string, side: 'main' | 'side', lost: boolean, search: string, devBuild: boolean): void {
  if (!koFallbackFor(hero, lost, search, devBuild)) return;
  applyKoFallback(root, hero, side, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
