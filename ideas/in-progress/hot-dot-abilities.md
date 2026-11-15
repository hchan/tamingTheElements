---
status: in-progress
added: 2026-11-14
---

# New abilities: heal over time (HoT) and damage over time (DoT)

Owner idea (2026-11-14): create new abilities, including HoT (heal over time) and DoT (damage over time).

- DoT examples by element: fire burn/ignite (ticks, may spread or be doused by water), water poison/rot or drowning drip, earth bleeding thorns or bramble, air bleed/static shock. Each needs a clear tick rate, duration, stacking rule (refresh vs stack, with a cap) and a cleanse interaction (see the existing cleanse system).
- HoT examples: a regrowth/spring/ember-warmth style heal that ticks for a few seconds, interruptible by damage or not (decide), usable on self and, in 2v2, on the tag partner.
- Fit the 24-hero roster and the melee/ranged split: DoT suits ranged zoners, HoT suits sustain melee, and every new ability needs a counter.
- Sim change (Arcade only, new SIM_VERSION, goldens and balance baselines re-recorded with a stated reason); deterministic integers and ticks only, no randomness outside seeded sfc32. Status icons and tick numbers must read without colour alone, with reduced-motion-safe FX (`status-fx-view`).
- Check the existing status-effect and Snag/root code first and reuse it; follow the add-ability skill. Queue behind other sim-changing work (only one sim agent at a time).
