---
status: idea
added: 2026-11-13
---

# Rethink the action bar: common slots plus a per-hero kit with a signature trap or minion (HIGH PRIORITY, TONS of work)

Owner request (2026-11-13): "your action bars still need rethinking ... like common guard, cleanse, common elemental, change weather animation. Maybe trap should be an ability like 1 and 2 ... and 3 should be a trap or minion and the 3 slot should be a new ability and you have to do TONS of work to create new abilities and add them to the hero ... so if 12 heroes, then 12 traps/or minion."

## Shape
- **Common slots (same for every hero, same hotkeys, one shared cooldown renderer):** Guard, Cleanse (see [elemental-cleanse](elemental-cleanse.md), 10 s), the element's common elemental ability, and Change Weather (with its animation).
- **Hero slots 1 and 2:** the hero's two signature abilities (as today).
- **Hero slot 3:** a signature **trap or minion**, unique per hero: 12 heroes = 12 new traps/minions (water curomo/ishimi/morblass, air cyclonius/echo/wispera, fire fiara/lavax/sindarosa, earth pax/rokcore/treenoc). Trap becomes a normal ability slot instead of a separate global mechanic ([bomb-traps](bomb-traps.md), [summon-temporary-minions](summon-temporary-minions.md)).
- Possibly a further new ability slot per hero; design each as elemental, grim, not humanoid.

## Work packages (one at a time on sim; each re-records goldens/baselines with a stated reason, SIM_VERSION bump)
1. Design doc: per-hero table (name, trap or minion, cost, cooldown, counterplay), common-slot layout and hotkey map. View-only prototype of the new bar first.
2. Sim: slot model (common vs hero slots), then Guard/Cleanse/Elemental/Weather as common slots.
3. Sim + view + audio per hero: 12 signature traps/minions, 3-4 heroes per batch (one element family at a time), each with animation and sound, AI usage, ability-usage coverage test.
4. Guide screen, Help, Tour ability info, balance pass.

## Status note (2026-11-13)
WP1 done: design doc [docs/design/action-bar-kits.md](../../docs/design/action-bar-kits.md) (12-hero table, common slots, hotkey map) and a view-only grouped bar behind `?ff=barGroups` (dev/test only; `src/game/hud/bar-groups.ts`). WP2 to WP4 still open.
