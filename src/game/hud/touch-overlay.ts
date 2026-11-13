import { LOGICAL_WIDTH } from '../boot/viewport';

/**
 * The Arcade touch buttons (`#arcade<Name>`, see `touch-controls.ts`) are transparent DOM overlays that sit exactly over their box on the
 * canvas action bar: the bar draws the icon, key, words and cooldown; the overlay only takes the finger (and keeps hold, aria and focus).
 */
export interface OverlayItem {
  readonly touch: string;
  /** Box in logical screen px (1280 wide). */
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** CSS box of an overlay relative to its offset parent: `canvas` and `parent` are viewport rects, `k` CSS px per logical px. Pure, for tests. */
export function overlayRect(item: OverlayItem, canvas: { left: number; top: number }, parent: { left: number; top: number }, k: number): { left: number; top: number; size: number } {
  return { left: canvas.left - parent.left + item.x * k, top: canvas.top - parent.top + item.y * k, size: item.size * k };
}

const px = (v: number): string => `${String(Math.round(v * 100) / 100)}px`;

/** Lays each `#arcade<touch>` button over its box and hides the buttons that have no box (writes a style only when it changed). */
export function syncTouchOverlays(items: readonly OverlayItem[], canvas: { getBoundingClientRect(): { left: number; top: number; width: number } }, doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  if (!doc) return;
  const c = canvas.getBoundingClientRect();
  if (!(c.width > 0)) return;
  const k = c.width / LOGICAL_WIDTH;
  const placed = new Set<Element>();
  for (const it of items) {
    if (it.touch === '') continue;
    const el = doc.getElementById(`arcade${it.touch}`);
    if (!(el instanceof HTMLElement)) continue;
    const parent = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const r = overlayRect(it, c, parent, k);
    const set = (name: 'left' | 'top' | 'width' | 'height' | 'visibility', v: string): void => {
      if (el.style[name] !== v) el.style[name] = v;
    };
    set('left', px(r.left));
    set('top', px(r.top));
    set('width', px(r.size));
    set('height', px(r.size));
    set('visibility', 'visible');
    placed.add(el);
  }
  doc.querySelectorAll<HTMLElement>('button.touchBtn').forEach((el) => {
    if (!placed.has(el) && el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
  });
}
