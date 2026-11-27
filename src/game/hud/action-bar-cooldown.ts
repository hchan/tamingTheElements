export const COOLDOWN_ALPHA = 0.52;

/**
 * Legacy `drawCooldown` polygon as flat x,y pairs: the not-yet-elapsed region, starting at top-centre
 * and sweeping clockwise as `progress` grows 0..1.
 */
export function cooldownSweep(progress: number, x: number, y: number, size: number): number[] {
  const p = Math.min(1, Math.max(0, progress));
  const half = size / 2;
  const pts = [x + half, y, x + half, y + half];
  const right = x + size;
  const bottom = y + size;
  if (p < 0.125) {
    pts.push(x + half + (p / 0.125) * half, y, right, y, right, bottom, x, bottom, x, y);
  } else if (p < 0.375) {
    pts.push(right, y + ((p - 0.125) / 0.25) * size, right, bottom, x, bottom, x, y);
  } else if (p < 0.625) {
    pts.push(right - ((p - 0.375) / 0.25) * size, bottom, x, bottom, x, y);
  } else if (p < 0.875) {
    pts.push(x, bottom - ((p - 0.625) / 0.25) * size, x, y);
  } else {
    pts.push(x + ((p - 0.875) / 0.125) * half, y);
  }
  return pts;
}

/** How long the ready flash lasts (ms), the colour and the strongest alpha of it: one look for every box. */
export const READY_FLASH_MS = 350;
export const READY_FLASH_COLOR = 0xe0d8c6;
export const READY_FLASH_ALPHA = 0.45;

/** What the one shared cooldown renderer draws for a box. */
export interface CooldownLook {
  /** The shaded not-yet-ready region as flat x,y pairs; undefined when the box is ready. */
  readonly fill: number[] | undefined;
  readonly fillAlpha: number;
  /** Ready flash: alpha of the bone wash over the box (0: none), and how strong its frame pulse is (0..1). */
  readonly flashAlpha: number;
  readonly pulse: number;
}

/**
 * THE cooldown look, the same for every kind of box (abilities, Snag, Tag, Charge, Weather, Dash, Guard, Super, Trap, Element): a clockwise
 * sweep over the part not yet ready (one fixed shade), then an eased-out bone flash for READY_FLASH_MS when it comes back
 * (`flashAgeMs` since it did, -1 for none). A disabled box is shaded whole. Reduced motion: a static whole-box shade while cooling and no flash.
 * Pure; `ActionBarView.drawCooldown` is its only drawer.
 */
export function cooldownLook(progress: number, disabled: boolean, x: number, y: number, size: number, flashAgeMs: number, reduced: boolean): CooldownLook {
  const whole = [x, y, x + size, y, x + size, y + size, x, y + size];
  const shaded = disabled || progress < 1;
  const fill = !shaded ? undefined : disabled || reduced ? whole : cooldownSweep(progress, x, y, size);
  const t = flashAgeMs < 0 ? 1 : flashAgeMs / READY_FLASH_MS;
  const ease = reduced || disabled || t >= 1 ? 0 : (1 - t) ** 3;
  return { fill, fillAlpha: COOLDOWN_ALPHA, flashAlpha: READY_FLASH_ALPHA * ease, pulse: ease };
}
