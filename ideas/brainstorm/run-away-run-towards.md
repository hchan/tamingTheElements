---
status: idea
added: 2026-11-17
---

# Run Away / Run Towards (auto-run ability, Tab)

Owner idea, 2026-11-17.

- **Ranged heroes** get an ability **Run Away**: for 5 s the hero automatically runs away from the opponent. Cooldown 7 s.
- **Melee heroes** get the opposite, **Run Towards**: for 5 s the hero automatically runs toward the opponent. Same duration and cooldown.
- Hot key: **Tab**.
- Pressing a movement key (WASD or the arrow keys) breaks the run early.

## Why

Kiting for ranged heroes and gap-closing for melee heroes, with no held direction needed. It also helps touch play and gives each kit a clear role, in the Street Fighter / Marvel vs Capcom spirit.

## Open questions to settle in the plan

- Which heroes count as ranged and which as melee (data-driven flag per hero, or derived from the kit)?
- Does the 7 s cooldown start when the run ends or when it is pressed? (5 s run plus 7 s cooldown from the press leaves a 2 s gap.)
- Does the run stop on contact (melee) or at the arena edge (ranged), and does a hit, stun or Snag root cancel it?
- Does it interact with the auto-face aim (WP 37) and with Dash and Guard?
- Phone: an action-bar button (the bar already has ability slots), since there is no Tab key.
- This is a sim change: a new ability, so a SIM_VERSION bump, golden re-record with a stated reason, balance run, determinism review (integer movement only). One sim-changing agent at a time; plan with an Opus agent first. See the add-ability skill.
- Player-facing text: say "Run Away" and "Run Towards" only; no mode words.
