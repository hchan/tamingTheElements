/**
 * The roster24 super cut-in composites (public/assets/img/cutin/<hero>.png, 1344x768; tools/assets/cutin-comp/README): the pure
 * part, no Phaser. `event-fx.ts` imports it (small, static); the drawing is `cutin-view.ts`, loaded on the first cut-in only.
 * Render only: it reads the super freeze the sink already gets and never touches the sim.
 */

/** The heroes that have a composite: the 12 roster24 heroes (tests/repo pins the files; cutin-gate.test.ts pins the list to the roster). */
export const CUTIN_HEROES: ReadonlySet<string> = new Set(['abyssor', 'brazgor', 'durrok', 'glimmaw', 'hyalia', 'kindrel', 'nykra', 'ouroth', 'quarrak', 'umbrel', 'vortigal', 'zephra']);

/** Dev and test builds only (same gate as `roster24On` in app/arcade-pick.ts, which fx must not import): `?ff=roster24`. Production never reads the URL. */
export const cutinFlagOn = (search: string, devBuild: boolean): boolean =>
  devBuild && (new URLSearchParams(search).get('ff') ?? '').split(',').map((f) => f.trim()).includes('roster24');

/** Whether a super by `hero` (its sprite name) shows a composite on this page. */
export const shouldCutin = (hero: string | undefined, search: string, devBuild: boolean): boolean =>
  hero !== undefined && CUTIN_HEROES.has(hero) && cutinFlagOn(search, devBuild);

export const cutinKey = (hero: string): string => `cutin:${hero}`;
export const cutinUrl = (base: string, hero: string): string => `${base.endsWith('/') ? base : `${base}/`}assets/img/cutin/${hero}.png`;

/** Total length (ms), fade-in, fade-out, peak opacity (the fight stays faintly visible) and slide distance (logical px; the image is drawn this much wider per side). */
export const CUTIN_MS = 600;
export const CUTIN_IN_MS = 120;
export const CUTIN_OUT_MS = 180;
export const CUTIN_ALPHA = 0.92;
export const CUTIN_SLIDE = 32;

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** One frame `ms` into the cut-in: opacity and the horizontal offset (logical px, towards `side` -1 left or 1 right while sliding in). Reduced motion fades only. */
export function cutinFrame(ms: number, reduced: boolean, side: -1 | 1, out: { alpha: number; dx: number }): { alpha: number; dx: number } {
  const enter = clamp01(ms / CUTIN_IN_MS);
  out.alpha = CUTIN_ALPHA * enter * clamp01((CUTIN_MS - ms) / CUTIN_OUT_MS);
  out.dx = reduced ? 0 : (1 - enter) * (1 - enter) * CUTIN_SLIDE * side;
  return out;
}
