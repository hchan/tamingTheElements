/**
 * Second public entry of core, for app code that is loaded lazily (the Arcade Versus chunk). What is exported here is
 * not reachable from `@core/index`, so the bundler keeps it out of the menu entry chunk (a module reachable from the
 * entry's barrel lands in the entry chunk even when only a lazy chunk uses it). Same layering rules as `index.ts`.
 * Named exports only: the app imports this module dynamically, so its namespace keeps every export alive in the bundle.
 */
export { ScriptedAI, scriptedProfileFor, type ScriptedAIOptions, type ScriptedProfile } from './agents/scripted-ai/index';
export { getCharacter } from './data/characters';
export { RandomBot } from './agents/random-bot';
export { parseReplayChecked, validateReplay } from './replay/validate';
export { serializeReplay, setupFromHeader } from './replay/format';
/** Numbers the Guide screen (a lazy chunk) reads, so its cards cannot drift from the sim data. */
export {
  BLOCK_STUN_TICKS, CHARGE_COOLDOWN_TICKS, DASH_COOLDOWN_TICKS, DASH_INVULN_FROM, DASH_INVULN_TO, ELEMENTAL_ARMOR_PM,
  ELEMENTAL_COOLDOWN_TICKS, ELEMENTAL_DAMAGE_PM, ELEMENTAL_NAMES, ELEMENTAL_SPEED_PM, ELEMENTAL_TICKS, GUARD_CHIP_PM,
  PARRY_TICKS, SNAG_COOLDOWN_TICKS, SNAG_ROOT_TICKS, SUPER_COST, WEATHER_COOLDOWN_TICKS, WEATHER_PM,
} from './data/arcade';
