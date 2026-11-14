---
status: in-progress
added: 2026-11-13
---

# 844x390: docked Fight/Start bar and tall menu hide most content

Severity: high (phone). At 844x390 the menu shows only Play, Versus and part of Online. Versus shows only filters behind the docked Fight!/Back. Play's Start tour covers the hero cards. In the fight no joystick is visible, the 48 px buttons are small, and the first-hint card takes about a third of the screen.

Fix: a compact phone layout (2-column menu, non-sticky dock on short heights, hint as a one-line toast, visible stick).

Screenshots: ~/claudetmp/qa/r3/ph-menu.png, ph-versus.png, ph-tour.png, ph-fight.png, phone.png.

Update 2026-11-13: CSS-only compact landscape block at the end of src/ui/styles/main.css (max-height 500px): 2-column menu, static docks, 12 px Versus/Play pickers, one-line first-run card. Still open: a visible touch stick (none exists; movement is keyboard only on touch), Play intro paragraph size. Screenshots: ~/claudetmp/qa/phone-fix/.
