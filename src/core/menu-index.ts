/**
 * Menu-safe barrel of core: data, rules, save, rng and flags, but none of the sim, agents, replay or net code. The main
 * menu entry chunk (and everything reachable from it) imports core only through this file, so the deterministic sim
 * stays out of the entry chunk and loads lazily (see docs/PERFORMANCE.md). Code that runs a match uses `@core/index`.
 * Same layering rules as `index.ts`; keep the two in step (`menu-index.test.ts` pins that this is a subset).
 */
export * from './version';
export * from './flags';
export * from './rng/sfc32';
export * from './rng/seed';
export * from './rng/streams';
export * from './data/chapters';
export * from './data/settings';
export * from './rules/objectives';
export * from './rules/damage';
export * from './rules/describe';
export * from './rules/garrison';
export * from './rules/opponents';
export * from './save/migrate';
export * from './save/v1';
export * from './save/validate';
export * from './data/ids';
export * from './data/elements';
export * from './data/types';
export * from './data/characters';
export * from './data/text-ids';
export * from './rules/new-game';
export { ARCADE_SNAG_SLOT, METER_BAR, METER_BARS, METER_MAX } from './data/arcade';
export * from './rules/progression';
export * from './rules/results';
export * from './data/abilities-a';
export * from './data/abilities-b';
export * from './tester/save-edits';
// Types only (erased at build time, so they do not pull the sim into the menu chunk).
export type { Agent } from './agents/agent';
export type { MatchSetup } from './sim/match';
export type { ReplayFile } from './replay/format';
export type { ArenaCheat, BenchRow, TickCheats } from './tester/cheats';
