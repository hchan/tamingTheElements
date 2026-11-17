---
status: done
added: 2026-11-12
---

# Dead or never-used ability data

From docs/ABILITY-AUDIT.md finding 8. Hurl Rock (80 DPS) and Elemental Advantage Fire Cone have no owner; Stick is the dummy's; Charge is 0.8% of Arcade damage; Weather secondary effects are data-only (WEATHER_EFFECTS_ON false). Decide per entry: give to a hero, document as legacy, or wire up (Weather effects). Check tests that pin abilities-a before removing rows.

Done 2026-11-17: re-checked on main at SIM_VERSION 85; docs, comments and a guard test only, no sim change. Hurl Rock: Quarrak's since roster-24 batch 1 (SIM_VERSION 72, Arcade cooldown 90 ticks); Quarrak is still unreleased (?ff=roster24 in dev and test builds). Elemental Advantage Fire Cone: kept as reserved legacy data (hashed def index 16, legacy fixtures, SNAG_FIRE_ABILITIES; flag elementalAdvantage kept as bit 0, read by no system). Stick: the Dummy's, kept. Capture: the Classic catch, kept. Charge: the 0.8% predates the armoured Charge (SIM_VERSION 50); usage goes to dash-parry-weather-usage. Weather: the Sun and Rain extras are built (Snag ropes; Iced with withCrowdControl; burning with withOverTime); Sandstorm and Gale moved to weather-secondary-effects. Fire Heal stays with fire-heal-buff. ABILITY-AUDIT rows (Hurl Rock, Fire Cone, Weather, Charge) and finding 8, GAME-DESIGN and FUN-DESIGN 2.14 corrected; guard test in src/core/data/characters.test.ts.
