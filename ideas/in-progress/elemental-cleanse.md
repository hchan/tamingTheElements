---
status: in-progress
added: 2026-11-13
---

# Cleanse for every elemental (HIGH PRIORITY)

Owner request (2026-11-13): all elementals should have a cleanse, one per element, each with its own animation, a sound when it is activated, and a cooldown of 10 s.

- **Water:** drops a water icon; water animation when activated.
- **Fire:** burns the debuffs off.
- **Earth:** breaks out of a shell.
- **Air:** blows the debuffs off.
- Cooldown 10 s for all four. Sound on activation (all four, element flavoured).

## Work packages
1. **Sim (SIM_VERSION bump, goldens/baselines re-recorded with a stated reason):** a Cleanse ability for all 12 heroes (or per-element shared ability), removes active debuffs (root/Snag, slow, burn, freeze, silence, stun where design allows), 10 s cooldown (500 ticks), a `Cleanse` event. Decide: does it also grant brief immunity; can it be used while stunned (probably not). AI usage rule (use when debuffed). Only one sim-changing agent at a time: start after the balance retune merges.
2. **View + audio:** four animations (water drop and splash, fire burn-off, earth shell break, air gust), numbered action-bar box with icon, cooldown through the common cooldown renderer, sound per element (Web Audio synth, see audio-and-music), reduced-motion static variant.
3. **Docs:** Guide screen ability entries, hero info panel, help.

## Progress (2026-11-13)
- **WP1 sim: done (SIM_VERSION 47).** Common Cleanse for all 12 heroes, Arcade only: `Cmd.cleanse` (bit 9, the swap3 bit Arcade never uses; Press 9), `src/core/sim/systems/arcade/cleanse.ts`, `CLEANSE_COOLDOWN_TICKS` 500 in `data/arcade.ts`, per-hero `ArcadeE.cleanseReadyAt`, event `cleanse {element, team, cleared}` (element = hero kind 1..4, 5 for the void dummy and boss). Documented in FUN-DESIGN 2.26.
- Decisions: cleansable = Snag root (the usual 75-tick post-root immunity follows, no extra immunity), Puddle slow, Ice Blast and tidal slows. The sim has no burn, freeze-as-debuff or silence; stun is not cleansable and Cleanse is refused while stunned (the press stays buffered and fires after). A rooted or guarding hero may cast. A cast with nothing to clear still spends the cooldown (`cleared` 0).
- Slot layout: it is a common slot (same for every hero) next to Trap and Tag, not part of a hero kit, so the action-bar rethink can place it without touching the sim. `RenderActionBar` is not changed yet; the AI sees `ArcadeView.cleanseIn`.
- AI: Normal and Hard press it when rooted or slowed; water's elemental defers to it while Cleanse is ready.
- Open: water's elemental ability is also named Cleanse and now duplicates the common one; rename or replace it in the view WP (suggest Tidecall or a different water self-buff).
- Remaining: WP2 (view, input binding for `Cmd.cleanse`, HUD box, touch button, four animations, `playSfx('cleanse', element)` on the event) and WP3 docs.

Related: [snag-ability](snag-ability.md), [audio-and-music](audio-and-music.md).
