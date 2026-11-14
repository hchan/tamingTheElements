---
status: done
added: 2026-11-14
---

# QA r26: Lavax, Ishimi and Treenoc blend into their own-element floors

Repro: `hero=fiara&foe=lavax` (dark on dark), `hero=curomo&foe=ishimi` (dark green on blue), `hero=rokcore&foe=treenoc` (brown on brown). The foe silhouette is hard to pick out at a glance, unlike SF characters against their backdrops.

Evidence: `~/claudetmp/qa26/st-fiara-lavax-180.png`, `st-curomo-ishimi-180.png`, `st-rokcore-treenoc-180.png`. Related: qa-r25-wispera-faint.

Suggest a rim light, or a darker/lighter floor under fighters.

## Done

Pale per-hero rims (Lavax cream, Ishimi lime, Treenoc mint) plus a small body lift in hero-grade.ts. The effect is subtle; push the rim harder if QA still finds them lost.
