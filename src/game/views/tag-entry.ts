// Render-only tag-in entry (qa-r125): the incoming hero slides in from the side AWAY from the foe, far enough and long enough
// that its sprite does not sit on the foe's. Sim x and hitboxes are untouched.

/** Slide distance in px at the start of the entry (estimate: about one hero body width plus a margin). */
export const TAG_IN_SLIDE_PX = 120;

/** Visual width in px of the widest hero frame, overscan included (estimate from the real-game check, qa-r125 left wall). */
export const TAG_IN_BODY_PX = 240;
/** Clear space in px left between the incoming sprite's edge and the foe's centre line at the start of the entry. */
export const TAG_IN_CLEAR_PX = 20;
/** Largest slide scale (times `TAG_IN_SLIDE_PX`): a hero in contact slides in from about two slide widths away. */
export const TAG_IN_MAX_SCALE = 2;

/** Sprite centre must stay this many px inside the arena edge for a sideways slide; closer, the hero drops in from above instead (estimate). */
export const TAG_IN_WALL_PX = 120;
/** Arena width in px (`ARCADE_ARENA_WIDTH`, repeated so this module stays free of core imports; a test pins it). */
export const TAG_IN_ARENA_W = 1920;

/** Slide offset magnitude at progress `t` 0..1: holds the full gap early (smoothstep), then settles to 0. */
export function tagEntrySlide(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return TAG_IN_SLIDE_PX * (1 - c * c * (3 - 2 * c));
}

/**
 * Pose dir for a tag-in (applyPose offsets by `-dir * slide`, so dir 1 starts left of the rest position): the entry starts on the
 * side away from the nearest foe. The incoming hero is still benched in the view (`have[to]` is 0), so the position used is the
 * OUTGOING hero's last drawn x (`lx[from]`; the incoming hero spawns there in the sim). Falls back to the team side (team 0 left)
 * when no foe or outgoing position is known.
 */
export function tagEntryDir(to: number, from: number, team: number, teams: ArrayLike<number>, have: ArrayLike<number>, lx: ArrayLike<number>): number {
  return nearestFoe(to, from, team, teams, have, lx).dir;
}

/**
 * Slide scale (1..`TAG_IN_MAX_SCALE`, the `power` of the tag-in pose) for the same entry: a foe in contact needs a longer slide than
 * `TAG_IN_SLIDE_PX` for the incoming sprite (wider than the sim box, and clamped to the screen at a wall) to clear the foe's sprite.
 */
export function tagEntryPower(to: number, from: number, team: number, teams: ArrayLike<number>, have: ArrayLike<number>, lx: ArrayLike<number>): number {
  const { gap } = nearestFoe(to, from, team, teams, have, lx);
  if (!Number.isFinite(gap)) return 1;
  const need = TAG_IN_BODY_PX + TAG_IN_CLEAR_PX - gap;
  return Math.min(TAG_IN_MAX_SCALE, Math.max(1, need / TAG_IN_SLIDE_PX));
}

function nearestFoe(to: number, from: number, team: number, teams: ArrayLike<number>, have: ArrayLike<number>, lx: ArrayLike<number>): { dir: number; gap: number } {
  const side = team === 0 ? 1 : -1;
  if (from < 0 || from >= lx.length || from === to) return { dir: side, gap: Infinity };
  const ox = lx[from] ?? 0;
  let foe = -1;
  let best = Infinity;
  for (let j = 0; j < teams.length; j++) {
    if (j === to || j === from || have[j] !== 1 || teams[j] === team || (teams[j] ?? -1) < 0) continue;
    const d = Math.abs((lx[j] ?? 0) - ox);
    if (d < best) { best = d; foe = j; }
  }
  if (foe < 0) return { dir: side, gap: Infinity };
  return { dir: ox <= (lx[foe] ?? 0) ? 1 : -1, gap: best };
}

/** The tag-in pose arguments `[dir, power]` for a `tagIn` event (fields `to`, `from`, `team`; `mask` wraps ids to view slots). */
export function tagEntryOf(e: { [k: string]: number | undefined }, mask: number, teams: ArrayLike<number>, have: ArrayLike<number>, lx: ArrayLike<number>): [number, number] {
  const to = (e['to'] ?? 0) & mask;
  const from = (e['from'] ?? -1) & mask;
  const team = e['team'] ?? 0;
  const dir = tagEntryDir(to, from, team, teams, have, lx);
  const power = tagEntryPower(to, from, team, teams, have, lx);
  const end = (lx[from] ?? 0) - dir * TAG_IN_SLIDE_PX * power;
  const wall = from >= 0 && from < lx.length && have[from] === 1 && (end < TAG_IN_WALL_PX - 80 || end > TAG_IN_ARENA_W - TAG_IN_WALL_PX);
  return [wall ? 0 : dir, power];
}
