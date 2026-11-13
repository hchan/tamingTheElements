/**
 * Fighting-game style hero select gestures, shared by the Play (tour) picker and the Versus picker. Pointer events (mouse, pen and
 * touch alike; HTML5 draggable is unreliable on touch) give three things on top of the keyboard and gamepad paths the screens keep:
 *
 * - a pointer click on a tile only PREVIEWS the hero (the screen shows its ability panel); a second click on the same tile, or the
 *   panel's "Add to team" button, assigns it. A keyboard activation (click with `detail === 0`) still assigns straight away,
 *   because the focus cursor has already previewed the hero.
 * - dragging a tile onto a team slot places the hero there; dragging a slot onto another slot swaps them; dropping anywhere else
 *   keeps everything as it was (a slot can never be left empty or doubled).
 * - tap fallback: after a tile is previewed ("armed"), tapping a slot assigns it there (`takeArmed`).
 *
 * The screens own what a pick means (selects, flags, swapping); this module only reports gestures. Slots are any element inside
 * `root` carrying `data-hero-slot="<key>"`; tiles are the passed elements.
 */

export interface HeroDndOptions {
  /** Both tiles and slots must be inside this element. */
  readonly root: HTMLElement;
  readonly tiles: readonly HTMLElement[];
  /** A click on tile `i` that only previews it (hover and focus keep working as before). */
  previewTile: (i: number) => void;
  /** Assign tile `i`'s hero to the screen's active slot (second click, keyboard, Add button). */
  assignTile: (i: number) => void;
  dropTile: (i: number, slot: string) => void;
  swapSlots: (from: string, to: string) => void;
  /** Whether a slot may be picked up (Versus: only slots with a chosen hero). Default: all. */
  slotDraggable?: (slot: string) => boolean;
}

export interface HeroDnd {
  /** Index of the tile a click is previewing, or -1. */
  armed: () => number;
  /** Returns the armed tile index and clears it (-1 when none): the tap-hero-then-tap-slot path. */
  takeArmed: () => number;
  disarm: () => void;
}

type Source = { kind: 'tile'; i: number; el: HTMLElement } | { kind: 'slot'; key: string; el: HTMLElement };

const MOUSE_THRESHOLD = 5;
const TOUCH_SLOP = 8;
const TOUCH_HOLD_MS = 220;

export function heroDnd(o: HeroDndOptions): HeroDnd {
  let armed = -1;
  let suppressClick = false;
  const setArmed = (i: number): void => {
    armed = i;
    o.tiles.forEach((t, k) => t.classList.toggle('heroArmed', k === i));
  };

  const slotOf = (n: EventTarget | null): HTMLElement | null => {
    const s = n instanceof Element ? n.closest<HTMLElement>('[data-hero-slot]') : null;
    return s && o.root.contains(s) ? s : null;
  };

  o.tiles.forEach((t, i) => {
    t.addEventListener('click', (e) => {
      if (e.detail === 0 || armed === i) {
        setArmed(-1);
        o.assignTile(i);
        return;
      }
      setArmed(i);
      o.previewTile(i);
    });
  });
  // A click that ends a drag must not also preview, assign or activate a slot.
  o.root.addEventListener(
    'click',
    (e) => {
      if (!suppressClick) return;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );

  const sourceAt = (target: EventTarget | null): Source | null => {
    if (!(target instanceof Element)) return null;
    const tile = target.closest<HTMLElement>('.heroTile');
    if (tile) {
      const i = o.tiles.indexOf(tile);
      return i >= 0 ? { kind: 'tile', i, el: tile } : null;
    }
    const slot = slotOf(target);
    const key = slot?.dataset['heroSlot'];
    if (slot && key !== undefined && (o.slotDraggable?.(key) ?? true)) return { kind: 'slot', key, el: slot };
    return null;
  };

  o.root.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const src = sourceAt(e.target);
    if (!src) return;
    const touch = e.pointerType === 'touch';
    const { pointerId, clientX: x0, clientY: y0 } = e;
    let started = false;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;
    let timer = 0;
    let raf = 0;
    let last: PointerEvent | null = null;
    let held = !touch;

    const hitSlot = (ev: PointerEvent): HTMLElement | null => {
      // Touch pointers stay captured to the first target, so look at what is under the finger.
      const under = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(ev.clientX, ev.clientY) : null;
      const s = slotOf(under ?? ev.target);
      if (!s) return null;
      return src.kind === 'slot' && s === src.el ? null : s;
    };
    const place = (ev: PointerEvent): void => {
      if (ghost) {
        ghost.style.left = `${String(ev.clientX)}px`;
        ghost.style.top = `${String(ev.clientY)}px`;
      }
    };
    const blockScroll = (ev: Event): void => {
      if (ev.cancelable) ev.preventDefault();
    };
    const highlight = (ev: PointerEvent): void => {
      const s = hitSlot(ev);
      if (s !== over) {
        over?.classList.remove('heroDropOn');
        s?.classList.add('heroDropOn');
        over = s;
      }
    };
    // Near the top or bottom edge of the window the page scrolls, so a slot (or a tile) out of view can still be reached.
    const edgeScroll = (): void => {
      raf = 0;
      if (!started || !last) return;
      const edge = 56;
      const dy = last.clientY < edge ? -14 : last.clientY > window.innerHeight - edge ? 14 : 0;
      if (dy !== 0) {
        window.scrollBy(0, dy);
        highlight(last);
      }
      raf = window.requestAnimationFrame(edgeScroll);
    };
    const begin = (ev: PointerEvent): void => {
      started = true;
      last = ev;
      if (typeof window.requestAnimationFrame === 'function') raf = window.requestAnimationFrame(edgeScroll);
      setArmed(-1);
      const rect = src.el.getBoundingClientRect();
      ghost = src.el.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('id');
      ghost.querySelectorAll('[id]').forEach((n) => {
        n.removeAttribute('id');
      });
      ghost.querySelectorAll('button').forEach((n) => {
        n.tabIndex = -1;
      });
      ghost.tabIndex = -1;
      ghost.removeAttribute('data-hero-slot');
      ghost.classList.add('heroGhost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.width = `${String(Math.max(rect.width, 80))}px`;
      document.body.append(ghost);
      src.el.classList.add('heroDragSource');
      o.root.classList.add('heroDragging');
      try {
        src.el.releasePointerCapture(pointerId);
      } catch {
        // Not captured (mouse): nothing to release.
      }
      document.addEventListener('touchmove', blockScroll, { passive: false });
      place(ev);
    };
    const finish = (drop: PointerEvent | null): void => {
      window.clearTimeout(timer);
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('touchmove', blockScroll);
      if (!started) return;
      ghost?.remove();
      over?.classList.remove('heroDropOn');
      src.el.classList.remove('heroDragSource');
      o.root.classList.remove('heroDragging');
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
      const target = drop ? hitSlot(drop) : null;
      const key = target?.dataset['heroSlot'];
      if (key === undefined) return;
      if (src.kind === 'tile') o.dropTile(src.i, key);
      else if (key !== src.key) o.swapSlots(src.key, key);
    };
    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) return;
      const dist = Math.hypot(ev.clientX - x0, ev.clientY - y0);
      if (!started) {
        if (touch && !held) {
          // Moved before the hold finished: the finger is scrolling the page, not dragging.
          if (dist > TOUCH_SLOP) finish(null);
          return;
        }
        if (dist < MOUSE_THRESHOLD) return;
        begin(ev);
      }
      last = ev;
      place(ev);
      highlight(ev);
    };
    const onUp = (ev: PointerEvent): void => {
      if (ev.pointerId === pointerId) finish(ev);
    };
    const onCancel = (ev: PointerEvent): void => {
      if (ev.pointerId === pointerId) finish(null);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      finish(null);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKey, true);
    if (touch) {
      // Touch: a short hold picks the tile up; a quick swipe still scrolls the page.
      timer = window.setTimeout(() => {
        held = true;
        begin(new PointerEvent('pointermove', { clientX: x0, clientY: y0, pointerId }));
      }, TOUCH_HOLD_MS);
    }
  });

  return {
    armed: () => armed,
    takeArmed: () => {
      const a = armed;
      setArmed(-1);
      return a;
    },
    disarm: () => {
      setArmed(-1);
    },
  };
}
