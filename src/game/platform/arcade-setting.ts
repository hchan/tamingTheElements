import { getUiFlags } from './flags';

/** Settings-save key of the "Arcade Versus (preview)" opt-in (FUN-DESIGN WP 11). Absent means off; only `true` turns it on. */
export const ARCADE_PREVIEW = 'arcadePreview';

/**
 * Arcade Versus is offered when the save opts in, or with `?ff=arcade` in dev and test builds (`search` defaults to the
 * page's). The flag check sits behind a static build-mode test, so production bundles drop it: the menu entry chunk has
 * almost no byte budget left.
 */
export function arcadeEnabled(save: Readonly<Record<string, unknown>> | null, search?: string): boolean {
  return (
    save?.[ARCADE_PREVIEW] === true ||
    ((import.meta.env.DEV || import.meta.env.MODE === 'test') && getUiFlags(search ?? (typeof location === 'undefined' ? '' : location.search)).arcade)
  );
}
