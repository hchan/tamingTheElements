/**
 * qa-r119 #3: the big damage numbers drew over the super cut-in title and element word. While the cut-in band is up its rows
 * are published under `CUT_BAND_KEY`; a number whose box overlaps those rows fades to `CUT_NUMBER_ALPHA`. Pure, render-only.
 */

/** The shared registry key: the cut-in band's rows (HUD units), set by super-view while the cut-in is up, `undefined` otherwise. */
export const CUT_BAND_KEY = 'tte.cutBand';
/** A number over the band: nearly gone, still a hint that a hit landed. */
export const CUT_NUMBER_ALPHA = 0.12;

export interface CutBand {
  readonly top: number;
  readonly bottom: number;
}

interface Registry {
  get(key: string): unknown;
}

/** The alpha multiplier for a number whose box spans rows `top`..`bottom` (HUD units): `CUT_NUMBER_ALPHA` when it overlaps the band, else 1. */
export function cutNumberFade(band: CutBand | undefined, top: number, bottom: number): number {
  if (!band) return 1;
  return bottom > band.top && top < band.bottom ? CUT_NUMBER_ALPHA : 1;
}

/** `cutNumberFade` reading the band from the registry (no band published = 1). */
export function cutNumberFadeOf(r: Registry, top: number, bottom: number): number {
  return cutNumberFade(r.get(CUT_BAND_KEY) as CutBand | undefined, top, bottom);
}
