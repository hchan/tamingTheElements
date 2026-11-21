---
status: done
triaged: obsolete (scorecard report, no new code items; landscape-phone Defeat overflow and portrait crowding are phone work dropped 2026-11-18; desktop first-run card crowding fixed by first-run-hint.ts auto-fade; floor chip limit per qa-r106-findings)
added: 2026-11-17
---

# QA r106 scorecard (headless Chromium, SwiftShader, 390x844, 667x375, 844x390, 1920x1080)

Scored 0-5 against Street Fighter / Marvel vs Capcom. Shots: `.scratch/shots106/` in the r106 QA worktree (gitignored).
Build: main at 59459364, `--mode test`, `vite preview` on port 7961 (stopped afterwards). Console and page errors across the scripted runs: none.
Scope: Versus picker, 1v1 fight, a super, 2v2, and the Defeat card at portrait, both landscape sizes and desktop. No e2e subset run this round (no code changed, browser pass only).

## Overall

| Axis | r103 | r105 | r106 | Evidence |
| --- | --- | --- | --- | --- |
| Fun | 3.4 | 3.4 | 3.4 | No combat change. Super cut-in and tag are still the peaks; stages differ by backdrop and hazard chip. |
| Graphics | 3.8 | 3.8 | 3.8 | Defeat card art (dragon and golem behind the result) is strong; portrait is still mostly sky with small fighters. |
| Readability | 4.3 | 4.5 | 4.6 | Landscape HUD now reads current/max and Strike circles name the ability; desktop HUD "Life 297/297" and "Life 308/308" match. Landscape Defeat card is taller than the screen. |

## By area

| Area | Result |
| --- | --- |
| Versus picker | Fine at all four sizes. |
| 1v1 fight, landscape 844x390 and 667x375 | r105 P2/P3 items fixed (life current/max, named Strike circles). |
| 1v1 fight, desktop | HUD consistent; hazard chips ("FIRE x2") plus the first-run card still crowd the lower floor (`fight-desk-b.png`, `2v2-desk-b.png`). |
| 2v2 | Desktop reads well; portrait HUD still crowded. |
| Portrait 390x844 | Sky about half the canvas, fighters small, action bar two rows in 2v2. |
| Match end (Defeat) | Reached at portrait, landscape and desktop. Portrait and desktop fit. Landscape overflows (see findings P2 1). |

## Verified fixed since r105

- Landscape HUD life current/max (r105 P2 3).
- Landscape Strike circles name the ability (r105 P3 4).

## Not done

- Victory card: forcing two KOs of the foe via the probe did not reach the win card in my script (the Defeat path did), so the win layout is unseen. The `match-end.spec.ts` win test exists and covers button positions at 1280x720, 390x844 and 360x640 only, not landscape phone.
- Hero-by-hero labels, real two-browser Online, Tour flow, Draw card.
- Super band left-edge clipping was not conclusively re-sampled at a later frame; I saw no clipping in the three super frames per viewport.
