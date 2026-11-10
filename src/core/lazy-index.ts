/**
 * Second public entry of core, for app code that is loaded lazily (the Arcade Versus chunk). What is exported here is
 * not reachable from `@core/index`, so the bundler keeps it out of the menu entry chunk (a module reachable from the
 * entry's barrel lands in the entry chunk even when only a lazy chunk uses it). Same layering rules as `index.ts`.
 * Named exports only: the app imports this module dynamically, so its namespace keeps every export alive in the bundle.
 */
export { ScriptedAI, scriptedProfileFor, type ScriptedAIOptions, type ScriptedProfile } from './agents/scripted-ai/index';
export { RandomBot } from './agents/random-bot';
export { parseReplayChecked, validateReplay } from './replay/validate';
export { serializeReplay, setupFromHeader } from './replay/format';
