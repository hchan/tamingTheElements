---
status: in-progress
added: 2026-11-13
---

# QA: action bar labels are tiny and the bar shifts between heroes

Severity: medium. QA evaluator pass 2026-11-13 on main 4ddd5ca4. Screenshots: ~/claudetmp/qa/shots/hit-2.png, 2v2-0.png, tag-1.png

In 77 px slots the 'Weather 3%' and 'Super 2%' text is about 9 px, and the Trap and Cleanse icons are murky. The Charge slot (5) appears only for some heroes, so slots move between heroes and after a tag swap (2v2-0.png vs tag-1.png). Keep slot positions fixed per key. In the test hook the weather, dash, guard and super slots report cmd 0: check that mouse or touch clicking them is not dead.

Partly done 2026-11-13: Charge slot is always present (dimmed when disabled), so slots no longer shift. Open: tiny labels, murky icons, cmd 0 click check.
