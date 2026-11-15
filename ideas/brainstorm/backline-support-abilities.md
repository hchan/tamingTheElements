---
status: idea
added: 2026-11-14
---

# Support abilities for the backline (heal, boost, cleanse)

Owner idea (2026-11-14): abilities that heal, boost or cleanse the backline (the benched tag partner in 2v2).

- Heal: restore HP to the benched partner (instant or as a HoT, see [hot-dot-abilities](hot-dot-abilities.md)); a bench regen aura.
- Boost: buff the partner for their next entry (damage, speed, shield on tag-in), or pre-charge their super.
- Cleanse: remove DoTs, roots and slows from the partner so they enter clean (see the cleanse system).
- Design questions: cost to the caster (cooldown, a brief vulnerable cast), whether it targets the active partner too, how it interacts with tag-swap timing and the assist system, and anti-turtling limits so the bench cannot out-heal all damage.
- Fits support-style heroes in the 24-hero roster; 1v1 needs a sensible fallback (self-only version or disabled).
- Sim change (Arcade only, SIM_VERSION bump, goldens and baselines re-recorded with a stated reason); deterministic integers only. HUD must show the buff on the bench portrait, readable without colour alone. Queue behind other sim work, and plan it together with the HoT/DoT plan since they share status code.
