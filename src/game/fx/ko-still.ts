import { cutinFlagOn, heroReleased } from './cutin-gate';

/**
 * The roster24 KO still (public/assets/img/ko/<hero>_ko.png, installed by tools/assets/ko-gen/install-r24-ko.py) on the Versus result
 * screen when that hero lost: it replaces the loser's portrait card face. Render only; released heroes always, the rest behind
 * `?ff=roster24` in dev/test builds (the cut-in gate). The image is fetched when the screen shows, never preloaded; a failed load keeps
 * the face. The stills are wide, body-only crops (tight bbox), so the card sizes by width and the fade-in is the only motion.
 */
// Abyssor is held (art-director 2026-11-26: the KO reads as a different monster); re-add after the i2i redo is approved.
export const KO_STILL_HEROES: ReadonlySet<string> = new Set(['umbrel', 'nykra']);

export const koStillUrl = (base: string, hero: string): string => `${base.endsWith('/') ? base : `${base}/`}assets/img/ko/${hero}_ko.png`;

/** The still's URL when `hero` lost (`lost`) and is released or the flag is on, else null. */
export function koStillFor(hero: string, lost: boolean, search: string, devBuild: boolean, base: string): string | null {
  return lost && KO_STILL_HEROES.has(hero) && (heroReleased(hero) || cutinFlagOn(search, devBuild)) ? koStillUrl(base, hero) : null;
}

/** Swaps the loser card's face (`side` 'main' = `.matchEndMain`, 'side' = `.matchEndSide`) for the still once it has loaded. */
export function applyKoStill(root: HTMLElement, hero: string, side: 'main' | 'side', url: string): void {
  const img = new Image();
  img.onload = () => {
    const face = root.querySelector<HTMLElement>(`.${side === 'main' ? 'matchEndMain' : 'matchEndSide'} .matchEndFace`);
    if (!face?.isConnected) return;
    img.className = 'matchEndKoStill';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.dataset['hero'] = hero;
    img.style.cssText = 'width:min(300px,60vw);height:auto;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(0,0,0,0.6))';
    face.replaceWith(img);
    if (typeof img.animate === 'function') img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });
  };
  img.src = url;
}

/** Entry for the result screen: does nothing unless the gate passes. */
export function showKoStill(root: HTMLElement, hero: string, side: 'main' | 'side', lost: boolean, search: string, devBuild: boolean, base: string): void {
  const url = koStillFor(hero, lost, search, devBuild, base);
  if (url) applyKoStill(root, hero, side, url);
}
