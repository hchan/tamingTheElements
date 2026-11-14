/**
 * Lanes for the centre-screen calls (qa-r27: K.O., "X IN!", SNAG, damage numbers and the ROUND banner piled up). The
 * super cut-in ('tte.cut') has the top priority and the main banner ('tte.banner') the next; a lower call waits, or is
 * dropped, instead of drawing over them. Pure: the registry is read through `get`, no Phaser.
 */

/** The shared registry keys: the super cut-in is up, the round banner is up. */
export const CUT_KEY = 'tte.cut';
export const BANNER_KEY = 'tte.banner';
/** The longest a deferred call waits (view ticks, 2 s): a held banner (K.O. holds until the next one) never swallows it. */
export const LANE_MAX_WAIT_TICKS = 100;

/** A call that only waits for a banner (not the super cut-in) is held this long at most (view ticks, 0.3 s): a tag during FIGHT! is not late. */
export const BANNER_WAIT_TICKS = 15;

interface Registry {
  get(key: string): unknown;
}

/** Whether the super cut-in is showing: nothing else is drawn at the centre meanwhile. */
export const cutUp = (r: Registry | undefined): boolean => r?.get(CUT_KEY) === true;
/** Whether a centre call (the super cut-in or the round banner) is showing: a lower call defers or is dropped. */
export const centreBusy = (r: Registry | undefined): boolean => cutUp(r) || r?.get(BANNER_KEY) === true;

/**
 * Whether the round banner `main` draws now. It yields to the super cut-in (a banner that runs out under it is simply
 * missed, a held one comes back) and an intro banner ("ROUND 2") yields to the round result card, so it never ghosts behind it.
 */
export function bannerDraws(cut: boolean, resultUp: boolean, intro: boolean, compactCard = false): boolean {
  // The short phone card is tall enough to run into the big K.O. call, and it names the result itself: the banner steps aside.
  return !cut && !(resultUp && (intro || compactCard));
}

/** The view tick an intro banner's own clock (fade, scale-in, name cards) starts: its start, or the end of the round result card if later, so "ROUND 2" is not spent behind the card. */
export const introClockStart = (from: number, resultEnd: number): number => Math.max(from, resultEnd);

/** A deferred call: counts the ticks it has waited while the centre is busy; it starts at once once `LANE_MAX_WAIT_TICKS` are used up. */
export class LaneWait {
  private waited = 0;

  /** True while the call must still wait; `dt` is the view ticks since the last check, `max` the cap. */
  hold(busy: boolean, dt: number, max = LANE_MAX_WAIT_TICKS): boolean {
    if (!busy || this.waited >= max) return false;
    this.waited += Math.max(0, dt);
    return true;
  }

  reset(): void {
    this.waited = 0;
  }
}
