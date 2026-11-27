/**
 * The "N HITS" combo chip drew over the super cut-in title and element word. While the cut-in band is published under
 * `CUT_BAND_KEY` (super-view.ts), a chip whose box overlaps its rows is hidden (alpha x 0). Pure, render-only.
 */
import { CUT_BAND_KEY, type CutBand } from './cut-numbers';

interface Registry {
  get(key: string): unknown;
}

/** The alpha multiplier for a chip spanning rows `top`..`bottom` (HUD units): 0 when it overlaps the band, else 1. */
export function comboCutFade(band: CutBand | undefined, top: number, bottom: number): number {
  if (!band) return 1;
  return bottom > band.top && top < band.bottom ? 0 : 1;
}

/** `comboCutFade` for a text box (origin-aware), reading the band from the registry. */
export function comboCutFadeOf(r: Registry, y: number, originY: number, displayHeight: number): number {
  const top = y - originY * displayHeight;
  return comboCutFade(r.get(CUT_BAND_KEY) as CutBand | undefined, top, top + displayHeight);
}

/** True while a status chip (box `y`..`y + h`) overlaps the super cut-in band: the chip is skipped for that frame (qa-r124 6). */
export function chipHiddenByCut(r: Registry, y: number, h: number): boolean {
  return comboCutFade(r.get(CUT_BAND_KEY) as CutBand | undefined, y, y + h) === 0;
}
