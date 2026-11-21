/**
 * Pure team model for the MvC-style picker (no DOM, no Phaser).
 * A slot is `{ hero, mine }` or null. `mine: false` is a suggestion (last pick, default or partner).
 */

export interface Slot {
  readonly hero: string;
  readonly mine: boolean;
}

export type SlotOrNull = Slot | null;

export interface Team {
  slots: SlotOrNull[];
  ready: boolean;
}

export interface LockResult {
  readonly ok: boolean;
  /** Slot index that was filled (ok only), else -1. */
  readonly index: number;
  /** Text for the live region. */
  readonly message: string;
}

export type PickKeyAction = 'lock' | 'ready' | 'fight';

function suggestion(hero: string | undefined): SlotOrNull {
  return hero ? { hero, mine: false } : null;
}

/** Truncates, or extends with suggestions (null when none is given for that slot). */
export function setSize(team: Team, size: number, suggestions: readonly string[] = []): void {
  const n = Math.max(0, Math.floor(size));
  if (team.slots.length > n) team.slots.length = n;
  while (team.slots.length < n) team.slots.push(suggestion(suggestions[team.slots.length]));
  team.ready = false;
}

export function createTeam(size: number, suggestions: readonly string[] = []): Team {
  const team: Team = { slots: [], ready: false };
  setSize(team, size, suggestions);
  return team;
}

/** Every slot is filled, suggestions included. */
export function complete(team: Team): boolean {
  return team.slots.length > 0 && team.slots.every((s) => s !== null);
}

/** Every slot holds a real pick. */
export function allMine(team: Team): boolean {
  return team.slots.length > 0 && team.slots.every((s) => s !== null && s.mine);
}

export function mineCount(team: Team): number {
  return team.slots.filter((s) => s?.mine).length;
}

/** Number of slots still missing a real (mine) pick. */
export function missing(team: Team): number {
  return team.slots.length - mineCount(team);
}

export function heroes(team: Team): string[] {
  return team.slots.map((s) => s?.hero ?? '');
}

function isMine(team: Team, hero: string): boolean {
  return team.slots.some((s) => s !== null && s.mine && s.hero === hero);
}

/** Fills the first empty or suggested slot; refuses a hero already mine on this team. */
export function lock(team: Team, hero: string): LockResult {
  if (team.ready) return { ok: false, index: -1, message: 'Team is ready; cancel first' };
  if (isMine(team, hero)) return { ok: false, index: -1, message: `${hero} is already on your team` };
  const target = team.slots.findIndex((s) => s === null || !s.mine);
  if (target < 0) {
    return { ok: false, index: -1, message: 'Team full: press Fight!, or remove a hero first' };
  }
  const replaced = team.slots[target] ?? null;
  const other = team.slots.findIndex((s, i) => i !== target && s !== null && !s.mine && s.hero === hero);
  if (other >= 0) team.slots[other] = replaced; // swap keeps the team complete
  team.slots[target] = { hero, mine: true };
  return { ok: true, index: target, message: `${hero} locked in slot ${String(target + 1)}` };
}

/** Un-readies first; otherwise empties the last mine slot. Returns the cleared index or -1. */
export function cancel(team: Team): number {
  if (team.ready) {
    team.ready = false;
    return -1;
  }
  for (let i = team.slots.length - 1; i >= 0; i--) {
    if (team.slots[i]?.mine) {
      team.slots[i] = null;
      return i;
    }
  }
  return -1;
}

/** Removes slot i; later slots move up and the last slot is left empty. */
export function removeAt(team: Team, i: number): void {
  if (i < 0 || i >= team.slots.length) return;
  team.slots.splice(i, 1);
  team.slots.push(null);
  team.ready = false;
}

/** Hidden-select path: sets slot i as mine without refusing duplicates; '' empties it. */
export function setAt(team: Team, i: number, hero: string): void {
  if (i < 0 || i >= team.slots.length) return;
  team.slots[i] = hero ? { hero, mine: true } : null;
  team.ready = false;
}

/** What the pick key does: ready/fight on a complete all-mine team, else lock under the cursor. */
export function pickKeyAction(team: Team, vsComputer: boolean): PickKeyAction {
  if (complete(team) && allMine(team)) return vsComputer ? 'fight' : 'ready';
  return 'lock';
}

/** Picks one random hero from the pool (not already mine on this team); counts as mine. */
export function randomFill(team: Team, pool: readonly string[], rng: () => number): LockResult {
  const free = pool.filter((h) => !isMine(team, h));
  if (free.length === 0) return { ok: false, index: -1, message: 'No hero left to pick' };
  const idx = Math.min(free.length - 1, Math.max(0, Math.floor(rng() * free.length)));
  return lock(team, free[idx] as string);
}
