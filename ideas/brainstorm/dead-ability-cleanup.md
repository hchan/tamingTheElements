---
status: idea
added: 2026-11-12
---

# Dead or never-used ability data

From docs/ABILITY-AUDIT.md finding 8. Hurl Rock (80 DPS) and Elemental Advantage Fire Cone have no owner; Stick is the dummy's; Charge is 0.8% of Arcade damage; Weather secondary effects are data-only (WEATHER_EFFECTS_ON false). Decide per entry: give to a hero, document as legacy, or wire up (Weather effects). Check tests that pin abilities-a before removing rows.
