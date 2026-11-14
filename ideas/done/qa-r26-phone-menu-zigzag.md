---
status: done
added: 2026-11-14
---

# QA r26: phone (844x390) main menu is a 2-column grid with left-aligned labels and zigzag order

Repro: viewport 844x390, open `/?seed=7`. Entries lay out Play/Versus, Online/Settings, Help with left-aligned labels, whereas desktop is a centred single column.

Evidence: `~/claudetmp/qa26/menu-phone.png` vs `menu.png`.

Suggest centred labels and a consistent order (or one row of five).

Done 2026-11-14: fixed.
