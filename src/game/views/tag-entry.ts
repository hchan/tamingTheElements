// Render-only tag-in entry (qa-r125): the incoming hero slides in from the side AWAY from the foe, far enough and long enough
// that its sprite does not sit on the foe's. Sim x and hitboxes are untouched.

/** Slide distance in px at the start of the entry (estimate: about one hero body width plus a margin). */
export const TAG_IN_SLIDE_PX = 120;

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
  const side = team === 0 ? 1 : -1;
  if (from < 0 || from >= lx.length || from === to) return side;
  const ox = lx[from] ?? 0;
  let foe = -1;
  let best = Infinity;
  for (let j = 0; j < teams.length; j++) {
    if (j === to || j === from || have[j] !== 1 || teams[j] === team || (teams[j] ?? -1) < 0) continue;
    const d = Math.abs((lx[j] ?? 0) - ox);
    if (d < best) { best = d; foe = j; }
  }
  if (foe < 0) return side;
  return ox <= (lx[foe] ?? 0) ? 1 : -1;
}
