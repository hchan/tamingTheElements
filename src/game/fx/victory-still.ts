import { CHARACTERS, characterId, type Element } from '@core/index';
import { cutinFlagOn, heroReleased } from './cutin-gate';
import { ELEMENT_COLORS } from './element-colors';

/**
 * The roster24 victory still (public/assets/img/victory/<hero>_victory.png, installed by tools/assets/victory-gen/victory-key.py) on
 * the Versus result screen when that hero wins. Render only; released heroes (RELEASED_ROSTER24) always, the rest behind `?ff=roster24` in dev/test builds (the cut-in gate); the image
 * is fetched when the screen shows, never preloaded. Other heroes and every loss or draw keep the portrait card.
 */
export const VICTORY_HEROES: ReadonlySet<string> = new Set(['glimmaw', 'brazgor', 'kindrel', 'vortigal', 'zephra', 'nykra', 'hyalia', 'ouroth', 'umbrel', 'abyssor', 'durrok', 'quarrak', 'curomo', 'ishimi', 'sindarosa', 'morblass', 'wispera']);

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

/** Heroes with a cut-in but no approved victory still get a win flash and a scale-pop on the portrait instead (none now: Quarrak's still shipped, so the set is empty; add a slug here only while a hero has no still, and the flash is tinted by that hero's element). */
export const FLASH_HEROES: ReadonlySet<string> = new Set();

export const FLASH_MS = 700;
export const POP_SCALE = 1.06;

/** Whether `hero` gets the flash fallback: a win, no still for the hero, released or the flag on, and motion allowed (reduced motion keeps the plain portrait). */
export function victoryFlashFor(hero: string, won: boolean, search: string, devBuild: boolean, reducedMotion: boolean): boolean {
  return won && !reducedMotion && FLASH_HEROES.has(hero) && !VICTORY_HEROES.has(hero) && (heroReleased(hero) || cutinFlagOn(search, devBuild));
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

export const CHIP_COUNT = 12;
export const CHIP_MS = 800;
const CHIP_COLORS: readonly string[] = ['#8a6a3a', '#b08a50', '#5e4a2c', '#cdb27a'];

/** Burst vectors (fixed, so the look is the same every time): chips fan out and up from the portrait centre, then fall back under gravity. */
export function chipVectors(count: number = CHIP_COUNT): { dx: number; dy: number; size: number; color: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const a = Math.PI * (1.1 + (0.8 * (i + 0.5)) / count); // upper half-circle, screen coords (y down)
    const r = 60 + (i % 3) * 22;
    return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r), size: 5 + (i % 4) * 2, color: CHIP_COLORS[i % CHIP_COLORS.length] ?? '#8a6a3a' };
  });
}

/** A short rock-chip and dust burst around the portrait (earth heroes). Chips are removed when done. */
export function applyChipBurst(face: HTMLElement): void {
  const host = face.parentElement;
  if (!host || typeof face.animate !== 'function') return;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const layer = document.createElement('div');
  layer.className = 'victoryChips';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = `position:absolute;left:${String(face.offsetLeft + face.offsetWidth / 2)}px;top:${String(face.offsetTop + face.offsetHeight / 2)}px;width:0;height:0;pointer-events:none;z-index:2`;
  for (const v of chipVectors()) {
    const chip = document.createElement('span');
    chip.className = 'victoryChip';
    chip.style.cssText = `position:absolute;left:0;top:0;width:${String(v.size)}px;height:${String(v.size - 1)}px;background:${v.color};border-radius:2px 1px 3px 1px;box-shadow:0 0 6px rgba(120,90,50,0.6)`;
    layer.append(chip);
    chip.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1, offset: 0 },
      { transform: `translate(${String(v.dx)}px,${String(v.dy)}px) rotate(200deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${String(v.dx * 1.2)}px,${String(v.dy + 70)}px) rotate(360deg)`, opacity: 0, offset: 1 },
    ], { duration: CHIP_MS, easing: 'ease-out', fill: 'forwards' });
  }
  host.append(layer);
  window.setTimeout(() => { layer.remove(); }, CHIP_MS + 100);
}

/** Plays the flash on the winner card's portrait (`.matchEndFace`), tinted by the hero's element. */
export function applyVictoryFlash(root: HTMLElement, hero: string): void {
  const face = root.querySelector<HTMLElement>('.matchEndMain .matchEndFace');
  if (!face || typeof face.animate !== 'function') return;
  const element = flashElementOf(hero);
  face.dataset['victoryFlash'] = hero;
  face.dataset['victoryFlashElement'] = element;
  face.animate(victoryFlashFrames(element), { duration: FLASH_MS, easing: 'ease-out' });
  if (element === 'earth') applyChipBurst(face);
}

/** Entry for the result screen: does nothing unless the gate passes. */
export function showVictoryStill(root: HTMLElement, hero: string, won: boolean, search: string, devBuild: boolean, base: string): void {
  const url = victoryStillFor(hero, won, search, devBuild, base);
  if (url) applyVictoryStill(root, hero, url);
  else if (victoryFlashFor(hero, won, search, devBuild, window.matchMedia('(prefers-reduced-motion: reduce)').matches)) applyVictoryFlash(root, hero);
}
