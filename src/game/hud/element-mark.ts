import type { Element } from '@core/index';

/** A mark as plain geometry, so a test can pin it without Phaser: filled polygons, a filled circle, or open polylines (air). */
export type ElementMark =
  | { readonly kind: 'poly'; readonly pts: readonly number[] }
  | { readonly kind: 'circle'; readonly r: number }
  | { readonly kind: 'lines'; readonly runs: readonly (readonly number[])[] };

/**
 * One distinct silhouette per element, matching the words' glyphs (`elementCue`): fire triangle, earth square, water circle,
 * air two waves, void diamond. Drawn in white on a dark chip so identity never rests on the frame colour. Offsets are from the centre.
 */
export function elementMark(e: Element, r: number): ElementMark {
  switch (e) {
    case 'fire': return { kind: 'poly', pts: [0, -r, r, r * 0.8, -r, r * 0.8] };
    case 'earth': return { kind: 'poly', pts: [-r * 0.8, -r * 0.8, r * 0.8, -r * 0.8, r * 0.8, r * 0.8, -r * 0.8, r * 0.8] };
    case 'water': return { kind: 'circle', r: r * 0.85 };
    case 'void': return { kind: 'poly', pts: [0, -r, r, 0, 0, r, -r, 0] };
    case 'air': {
      const w = (y: number): readonly number[] => [-r, y, -r / 2, y - r * 0.4, 0, y, r / 2, y - r * 0.4, r, y];
      return { kind: 'lines', runs: [w(-r * 0.35), w(r * 0.45)] };
    }
  }
}
