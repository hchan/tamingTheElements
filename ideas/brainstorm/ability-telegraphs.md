---
status: idea
added: 2026-11-12
---

# Show the danger zone of big abilities

Follow-up from ability-audit (static graphics pass, docs/ABILITY-AUDIT.md). Ground Shock and Hurricane hit a 240x240 box but draw 80x80 art; Entangling Vines and Steal Health reach 360 and 240 px from 80 px art; Crimson Fire's box (80x40) is larger than its see-through sprite. Add a faint telegraph (ring or line at the true box, during the 250 ms delay) and make dark sprites (Chaos Orb, Crimson Fire, Adrenaline, Strangling Branches) brighter. View only, no sim change; verify with real-game screenshots on each floor.
