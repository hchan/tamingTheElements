/**
 * On-screen action button layout: size (compact row or large column) and side (right or left-handed).
 * Device-local presentation choice kept in localStorage (not the save, so it never touches the sim-side save schema).
 * "auto" picks large when ANY pointer is coarse (touch laptops and hybrids), compact otherwise.
 */
export type TouchSize = 'auto' | 'large' | 'compact';
export type TouchSide = 'right' | 'left';

export interface TouchLayout {
  readonly size: TouchSize;
  readonly side: TouchSide;
}

export const TOUCH_LAYOUT_KEY = 'tte.touchLayout';
export const DEFAULT_TOUCH_LAYOUT: TouchLayout = { size: 'auto', side: 'right' };

type MatchMedia = (query: string) => { readonly matches: boolean };
type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Reads the stored layout; anything unrecognised falls back to the default for that field. */
export function readTouchLayout(store: Store | undefined = defaultStore()): TouchLayout {
  try {
    const raw = store?.getItem(TOUCH_LAYOUT_KEY);
    if (raw === null || raw === undefined) return DEFAULT_TOUCH_LAYOUT;
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    const size = o?.['size'];
    const side = o?.['side'];
    return {
      size: size === 'large' || size === 'compact' || size === 'auto' ? size : 'auto',
      side: side === 'left' || side === 'right' ? side : 'right',
    };
  } catch {
    return DEFAULT_TOUCH_LAYOUT;
  }
}

export function writeTouchLayout(layout: TouchLayout, store: Store | undefined = defaultStore()): void {
  try {
    store?.setItem(TOUCH_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Private mode or quota: the choice just lasts until reload.
  }
}

/** Pure: "auto" is large when any pointer is coarse (touch laptop, tablet), else compact. */
export function resolveTouchSize(size: TouchSize, anyCoarse: boolean): 'large' | 'compact' {
  return size === 'auto' ? (anyCoarse ? 'large' : 'compact') : size;
}

/** Reflects the layout on `<html>` as `data-touch-size` (large|compact) and `data-touch-side` for the stylesheet. */
export function applyTouchLayout(
  layout: TouchLayout = readTouchLayout(),
  root: HTMLElement = document.documentElement,
  matchMedia: MatchMedia | undefined = typeof window === 'undefined' ? undefined : window.matchMedia.bind(window),
): void {
  const anyCoarse = matchMedia?.('(any-pointer: coarse)').matches ?? false;
  root.dataset['touchSize'] = resolveTouchSize(layout.size, anyCoarse);
  root.dataset['touchSide'] = layout.side;
}
