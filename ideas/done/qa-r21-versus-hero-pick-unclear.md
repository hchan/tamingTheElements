---
status: done
added: 2026-11-14
---

# Versus: clicking a hero tile does not pick it

In the Versus picker (`m-02-2v2-pick.png`) clicking a roster tile (e.g. Curomo) only opens the detail card on the right; the
player must press a separate "Add to team" button. A first-time player (and my bot) clicks the tile and Fights with the default
Sindarosa. Idea: double-click or tile click selects and shows a clear "Selected" ring, with the detail card as secondary.
Also the tile list is cut off by the sticky Fight! bar at 720 px height ("More heroes below" is the only hint).

## Progress

Real UX bug (reproduced headless): a pointer click only previewed (armed) the hero; the You card stayed on the default, so Fight started with Sindarosa. Fixed: in Versus a single click picks (aria-pressed, P1 chip, status "Picked", You card); a double click picks once; keyboard Enter already picked. Hover and the Add to team button still preview/pick. The tile list cut-off behind the sticky Fight bar is unchanged (still hinted by "More heroes below").
