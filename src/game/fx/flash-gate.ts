/**
 * Hit-flash rate cap (WCAG 2.3.1: no more than 3 flashes in any one second). View time only: the gate reads the view
 * tick (50 per second) and never touches the sim. One gap of 17 ticks (340 ms) per target keeps any 1 s window at 3 or fewer.
 */
export const FLASH_MIN_GAP_TICKS = 17;

export class FlashGate {
  private readonly last = new Map<number, number>();

  /** True when `target` may flash at view tick `tick`; records the flash when it does. A tick going backwards resets the target. */
  allow(target: number, tick: number): boolean {
    const prev = this.last.get(target);
    if (prev !== undefined && tick >= prev && tick - prev < FLASH_MIN_GAP_TICKS) return false;
    this.last.set(target, tick);
    return true;
  }

  clear(): void {
    this.last.clear();
  }
}
