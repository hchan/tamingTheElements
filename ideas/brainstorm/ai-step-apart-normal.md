---
status: idea
added: 2026-11-15
---

# Never stand inside the foe, at Normal too

WALL-2 limits the "step apart when boxes overlap" AI rule to Hard. At Normal in the prototype it moved the best race to 0.693 win rate (ceiling 0.70). Find which race gains with `balance:compare` and why leaving the overlap changes close-range trades, then decide whether to widen it.

WALL-3b ships the gap rule for Hard only (plan recommendation); Normal stays as is.

## Progress 2026-11-23 (coordinator): Normal AI footsies item 3 parked
Builder variants (branch worktree-footsies-n, unmerged, numbers in its .scratch/{a,b}/): full design, step-apart only (A) and ranged close-in only (B) all moved arcade Normal balance out of band (A: treenoc -15.9, pax +13.1, fun:gates worst race .261; B: pax +8.5, treenoc -8.5; fun:gates ok). Step-apart is the main driver of the shift. Only the probe flag and Easy/Hard command-stream guards were cherry-picked to main (no sim change). Revisit only with a balance retune (treenoc/pax) planned together.
