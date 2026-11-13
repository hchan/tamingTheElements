---
status: in-progress
added: 2026-11-12
---

# Win quotes and portraits

Source of the idea: Street Fighter II / Marvel vs Capcom. Each hero has two or three win quotes and a victory pose; the loser reacts. Text only first; data in the character text table (`CHARACTER_TEXT`). Localisation-ready.
Progress 2026-11-13: view-only text quotes on the results screens (src/ui/screens/win-quotes.ts, 2-3 per hero, picked by a stable hash of hero and XP; the loser gets a reaction line). Still open: victory pose/portraits, quotes keyed by the opponent, localisation table.
