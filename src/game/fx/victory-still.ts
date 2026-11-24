import { CHARACTERS, characterId, type Element } from '@core/index';
import { cutinFlagOn, heroReleased } from './cutin-gate';
import { ELEMENT_COLORS } from './element-colors';

/**
 * The roster24 victory still (public/assets/img/victory/<hero>_victory.png, installed by tools/assets/victory-gen/victory-key.py) on
 * the Versus result screen when that hero wins. Render only; released heroes (RELEASED_ROSTER24) always, the rest behind `?ff=roster24` in dev/test builds (the cut-in gate); the image
 * is fetched when the screen shows, never preloaded. Other heroes and every loss or draw keep the portrait card.
 */
export const VICTORY_HEROES: ReadonlySet<string> = new Set(['glimmaw', 'brazgor', 'kindrel', 'vortigal', 'zephra', 'nykra', 'hyalia', 'ouroth', 'umbrel', 'abyssor', 'durrok']);

export const victoryStillUrl = (base: string, hero: string): string => `${base.endsWith('/') ? base : `${base}/`}assets/img/victory/${hero}_victory.png`;

/** The still's URL when `hero` won (`won`) when released or the flag is on, else null. */
export function victoryStillFor(hero: string, won: boolean, search: string, devBuild: boolean, base: string): string | null {
  return won && VICTORY_HEROES.has(hero) && (heroReleased(hero) || cutinFlagOn(search, devBuild)) ? victoryStillUrl(base, hero) : null;
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

/** Heroes with a cut-in but no approved victory still (Quarrak: three art rounds rejected): they get a win flash and a scale-pop on the portrait instead. */
export const FLASH_HEROES: ReadonlySet<string> = new Set(['quarrak']);

export const FLASH_MS = 700;
export const POP_SCALE = 1.06;

/** Whether `hero` gets the flash fallback: a win, no still for the hero, the flag on, and motion allowed (reduced motion keeps the plain portrait). */
export function victoryFlashFor(hero: string, won: boolean, search: string, devBuild: boolean, reducedMotion: boolean): boolean {
  return won && !reducedMotion && FLASH_HEROES.has(hero) && !VICTORY_HEROES.has(hero) && cutinFlagOn(search, devBuild);
}

/** The hero's element (Quarrak is earth); void for an unknown slug. */
export function flashElementOf(hero: string): Element {
  const id = characterId(hero);
  return CHARACTERS.find((c) => c.id === id)?.element ?? 'void';
}

const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Keyframes for the winner portrait: a brief glow in the hero's element colour (ELEMENT_COLORS) that fades while the card pops to POP_SCALE and settles. */
export function victoryFlashFrames(element: Element = 'void'): Keyframe[] {
  const c = css(ELEMENT_COLORS[element]);
  return [
    { transform: 'scale(1)', filter: `brightness(1.9) drop-shadow(0 0 18px ${c})`, offset: 0 },
    { transform: `scale(${String(POP_SCALE)})`, filter: `brightness(1.35) drop-shadow(0 0 12px ${c})`, offset: 0.35 },
    { transform: 'scale(1)', filter: 'brightness(1) drop-shadow(0 0 0 transparent)', offset: 1 },
  ];
}

/** Plays the flash on the winner card's portrait (`.matchEndFace`), tinted by the hero's element. */
export function applyVictoryFlash(root: HTMLElement, hero: string): void {
  const face = root.querySelector<HTMLElement>('.matchEndMain .matchEndFace');
  if (!face || typeof face.animate !== 'function') return;
  const element = flashElementOf(hero);
  face.dataset['victoryFlash'] = hero;
  face.dataset['victoryFlashElement'] = element;
  face.animate(victoryFlashFrames(element), { duration: FLASH_MS, easing: 'ease-out' });
}

/** Entry for the result screen: does nothing unless the gate passes. */
export function showVictoryStill(root: HTMLElement, hero: string, won: boolean, search: string, devBuild: boolean, base: string): void {
  const url = victoryStillFor(hero, won, search, devBuild, base);
  if (url) applyVictoryStill(root, hero, url);
  else if (victoryFlashFor(hero, won, search, devBuild, window.matchMedia('(prefers-reduced-motion: reduce)').matches)) applyVictoryFlash(root, hero);
}
