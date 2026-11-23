import { cutinFlagOn } from './cutin-gate';

/**
 * The roster24 victory still (public/assets/img/victory/<hero>_victory.png, installed by tools/assets/victory-gen/victory-key.py) on
 * the Versus result screen when that hero wins. Render only, behind `?ff=roster24` in dev/test builds (the cut-in gate); the image
 * is fetched when the screen shows, never preloaded. Other heroes and every loss or draw keep the portrait card.
 */
export const VICTORY_HEROES: ReadonlySet<string> = new Set(['glimmaw', 'brazgor', 'kindrel', 'vortigal', 'zephra', 'nykra', 'hyalia', 'ouroth', 'umbrel', 'abyssor']);

export const victoryStillUrl = (base: string, hero: string): string => `${base.endsWith('/') ? base : `${base}/`}assets/img/victory/${hero}_victory.png`;

/** The still's URL when `hero` won (`won`) on a page where the flag is on, else null. */
export function victoryStillFor(hero: string, won: boolean, search: string, devBuild: boolean, base: string): string | null {
  return won && VICTORY_HEROES.has(hero) && cutinFlagOn(search, devBuild) ? victoryStillUrl(base, hero) : null;
}

/** Swaps the winner card's face for the still once it has loaded (a failed load keeps the face). `root` is the results view. */
export function applyVictoryStill(root: HTMLElement, hero: string, url: string): void {
  const img = new Image();
  img.onload = () => {
    const face = root.querySelector<HTMLElement>('.matchEndMain .matchEndFace');
    if (!face?.isConnected) return;
    img.className = 'matchEndStill';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.dataset['hero'] = hero;
    img.style.cssText = 'width:min(300px,60vw);height:auto;border-radius:14px;box-shadow:0 0 22px rgba(255,230,0,0.5)';
    face.replaceWith(img);
  };
  img.src = url;
}

/** Entry for the result screen: does nothing unless the gate passes. */
export function showVictoryStill(root: HTMLElement, hero: string, won: boolean, search: string, devBuild: boolean, base: string): void {
  const url = victoryStillFor(hero, won, search, devBuild, base);
  if (url) applyVictoryStill(root, hero, url);
}
