import { getUiFlags } from '../../game/platform/flags';
import { el } from '../dom';
import { SIZE_SCALE, pickShowcase, type ShowcaseHero, type SlotKind } from './showcase-data';

/**
 * Main-menu hero showcase (WP M1), a lazy chunk imported by the main menu: a decorative, `aria-hidden` layer of 1 to 3 random hero cut-outs
 * behind the five entries. It is not focusable and never takes the pointer; `menu-showcase.css` places the slots per viewport. The seed
 * comes from `?seed=` in dev and test builds, otherwise from the crypto API. Until the SD cut-outs land (`VITE_SD_ART=1`) the owner's
 * original painted portraits are used.
 */

const base = (): string => import.meta.env.BASE_URL;
const SD_ART = import.meta.env.VITE_SD_ART === '1';

function loadCss(): void {
  if (document.getElementById('menuShowcaseCss')) return;
  const link = el('link');
  link.id = 'menuShowcaseCss';
  link.rel = 'stylesheet';
  link.href = `${base()}assets/css/menu-showcase.css`;
  document.head.append(link);
}

/** Slots for this viewport: a phone in portrait gets one hero, a wide screen three, everything else two. */
export function slotsFor(w: number, h: number): SlotKind[] {
  if (w <= 600 && h > w) return ['ground'];
  if (h <= 500) return ['ground', 'ground'];
  if (w >= 1600) return ['ground', 'ground', 'floater'];
  return ['ground', 'ground'];
}

function seedValue(): number {
  const flagged = getUiFlags(window.location.search).seed;
  if (flagged !== null) return flagged;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] as number;
}

function image(hero: ShowcaseHero): HTMLImageElement {
  const img = el('img');
  img.alt = '';
  img.decoding = 'async';
  img.setAttribute('fetchpriority', 'low');
  img.draggable = false;
  const original = `${base()}assets/img/map/${hero.sprite}Large.png`;
  if (SD_ART) {
    const dir = `${base()}assets/img/showcase/${hero.sprite}`;
    img.addEventListener(
      'error',
      () => {
        img.removeAttribute('srcset');
        img.src = original;
      },
      { once: true },
    );
    img.srcset = `${dir}-512.webp 512w, ${dir}-1024.webp 1024w`;
    img.sizes = '(max-width: 900px) 512px, 1024px';
    img.src = `${dir}-1024.webp`;
  } else {
    img.src = original;
  }
  return img;
}

/** Builds the layer and puts it in `container`; returns a function that removes it. */
export function mountShowcase(container: HTMLElement): () => void {
  loadCss();
  const layer = el('div');
  layer.id = 'menuShowcase';
  layer.setAttribute('aria-hidden', 'true');
  const slots = slotsFor(window.innerWidth, window.innerHeight);
  pickShowcase(seedValue(), slots).forEach((p, i) => {
    const side = p.slot === 'floater' ? 'sky' : i === 0 ? 'left' : 'right';
    const slot = el('div', `scSlot scSlot-${side} sc-${p.hero.size} sc-${p.hero.motion}`);
    slot.dataset.hero = p.hero.sprite;
    slot.style.setProperty('--sc-k', String(p.slot === 'floater' ? Math.min(SIZE_SCALE[p.hero.size], SIZE_SCALE.small) : SIZE_SCALE[p.hero.size]));
    slot.style.setProperty('--sc-aspect', String(p.hero.aspect));
    slot.style.setProperty('--sc-feet', String(p.hero.feet[1]));
    slot.style.setProperty('--sc-phase', p.phase.toFixed(3));
    const flipper = el('div', 'scFlip');
    if (p.flip) flipper.style.transform = 'scaleX(-1)';
    flipper.append(el('span', 'scShadow'), image(p.hero));
    slot.append(flipper);
    layer.append(slot);
  });
  container.prepend(layer);
  return () => {
    layer.remove();
    document.getElementById('menuShowcaseCss')?.remove();
  };
}
