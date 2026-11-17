import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../boot/viewport';

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

/** Height in CSS px of an overlay: its square, plus `extendPx` (the portrait skirt below the canvas) when given. Pure, for tests. */
export function overlayHeight(size: number, extendPx?: number): number {
  return size + (extendPx ?? 0);
}

/** Lays each `#arcade<touch>` button over its box (taller by `extendPx` CSS px, class `touchSkirt`, when given) and hides the buttons that have no box (writes a style only when it changed). */
export function syncTouchOverlays(items: readonly OverlayItem[], canvas: { getBoundingClientRect(): { left: number; top: number; width: number; height: number } }, doc: Document | undefined = typeof document === 'undefined' ? undefined : document, extendPx?: number): void {
  if (!doc) return;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return;
  // The canvas is 720 logical px high; with the wide view it is wider than 1280 and the 1280 box sits in its middle; with the tall
  // view (portrait play) it is taller and the 1280x720 box sits at the bottom (the action bar lives there).
  const k = Math.min(rect.width / LOGICAL_WIDTH, rect.height / LOGICAL_HEIGHT);
  const c = { left: rect.left + (rect.width - LOGICAL_WIDTH * k) / 2, top: rect.top + rect.height - LOGICAL_HEIGHT * k };
  const placed = new Set<Element>();
  const ref = doc.querySelector<HTMLElement>('button.touchBtn');
  const decos = new Set<string>();
  items.forEach((it, i) => {
    // Boxes without a button (strikes and Snag take the canvas tap; Charge and Tag are absent for some heroes) still get the portrait skirt, as a click-through strip, so the bar's lower edge is even.
    if ((it.touch !== '' && doc.getElementById(`arcade${it.touch}`) instanceof HTMLElement) || extendPx === undefined || !ref?.parentElement) return;
    const id = `touchSkirtDeco${String(i)}`;
    let d = doc.getElementById(id);
    if (!(d instanceof HTMLElement)) {
      d = doc.createElement('div');
      d.id = id;
      d.className = 'touchSkirt touchSkirtDeco';
      d.setAttribute('aria-hidden', 'true');
      ref.parentElement.appendChild(d);
    }
    const r = overlayRect(it, c, ref.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 }, k);
    const vals = { left: px(r.left), top: px(r.top), width: px(r.size), height: px(overlayHeight(r.size, extendPx)) };
    for (const [name, v] of Object.entries(vals) as ['left' | 'top' | 'width' | 'height', string][]) if (d.style[name] !== v) d.style[name] = v;
    decos.add(id);
  });
  doc.querySelectorAll('.touchSkirtDeco').forEach((d) => { if (!decos.has(d.id)) d.remove(); });
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
    set('height', px(overlayHeight(r.size, extendPx)));
    el.classList.toggle('touchSkirt', extendPx !== undefined);
    set('visibility', 'visible');
    placed.add(el);
  }
  doc.querySelectorAll<HTMLElement>('button.touchBtn').forEach((el) => {
    if (!placed.has(el) && el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
  });
}
