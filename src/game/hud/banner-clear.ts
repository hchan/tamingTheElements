/**
 * Keeps the FIGHT! and ROUND banners off the fighters (QA r117): when two fighters spawn or rush in close, the centred
 * banner sat on their heads. Render-only and pure (no Phaser): the banner dims while a fighter's screen box overlaps it,
 * and comes back as the fighter leaves. Boxes are logical screen px (1280x720).
 */

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Banner alpha multiplier while a fighter is under it (the words stay readable, the fighter shows through). */
export const BANNER_CLEAR_ALPHA = 0.3;
/** Share of the multiplier the eased value moves toward its target per drawn frame (about 0.1 s at 60 fps). */
export const BANNER_CLEAR_EASE = 0.25;
/** Overlap slack (logical px) so a fighter just brushing the banner's box does not dim it. */
const SLACK = 12;

/** Calls that dim: the round-start words, not the K.O. (which must stay loud). */
export const bannerDims = (main: string, intro: boolean): boolean => main === 'FIGHT!' || intro;

/** Whether any fighter box overlaps the banner box by more than the slack. */
export function fighterUnder(banner: Box, fighters: readonly Box[]): boolean {
  for (const f of fighters) {
    if (f.x + f.w - SLACK > banner.x && f.x + SLACK < banner.x + banner.w && f.y + f.h - SLACK > banner.y && f.y + SLACK < banner.y + banner.h) return true;
  }
  return false;
}

/** One eased step of the banner's multiplier toward `BANNER_CLEAR_ALPHA` (a fighter under it) or 1. */
export function easeClear(current: number, under: boolean): number {
  const target = under ? BANNER_CLEAR_ALPHA : 1;
  const next = current + (target - current) * BANNER_CLEAR_EASE;
  return Math.abs(next - target) < 0.01 ? target : next;
}
