---
status: idea
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

Related: [snag-ability](snag-ability.md), [audio-and-music](audio-and-music.md).
