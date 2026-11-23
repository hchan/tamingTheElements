/**
 * Per-sprite extra display scale (view only; sim boxes never change). Some baked sheets draw the body smaller inside the
 * frame box than their neighbours, so the hero reads small on screen. The factor multiplies the hero scale, so the visual
 * box, glow, halo, shadow and attachments grow together about the feet centre. Sprites not listed draw at 1.
 */
export const DISPLAY_SCALE: Readonly<Record<string, number>> = { zephra: 1.15 };

/** The extra display scale for sprite `name` (1 when unlisted). */
export function displayScaleOf(name: string): number {
  return DISPLAY_SCALE[name] ?? 1;
}
