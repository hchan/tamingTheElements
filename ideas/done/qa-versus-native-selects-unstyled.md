---
status: done
added: 2026-11-13
---

# QA: Versus screen uses unstyled native selects

Severity: medium. QA evaluator pass 2026-11-13 on main 622c6619. Screenshots: ~/claudetmp/qa2/s/02-versus.png, 02-arcade.png, phone-arcade.png

Race and level pickers are default browser selects with no portrait, element icon or colour, so the first screen of a match looks like a form. Replace with a portrait grid, or at least styled selects with element icons (see mvc-character-select-with-ability-info).

Done 2026-11-13: Opponent, Team and AI level are now styled radio-button groups (check mark plus colour) over the hidden real selects (same ids); the hero picker was already the portrait grid.
