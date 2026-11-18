---
status: idea
added: 2026-11-17
---

# QA r105 scorecard (headless Chromium, SwiftShader, 1280x720, 844x390, 390x844)

Scored 0-5 against Street Fighter / Marvel vs Capcom. Shots: `.scratch/shots105/` in the r105 QA worktree (gitignored).
Build: current main (65c0ee8b), `--mode test`, `vite preview` on port 7942. Console and page errors across all scripted runs: none. Banned-word (Classic, Arcade, ruleset, Capture) and horizontal-overflow checks: nothing found.
Scope: menu, Help, Versus picker, Tour (pick, card, fight), 1v1 in all four stages, a super, 2v2 with a tag swap, at desktop, phone landscape and phone portrait. E2E subset (1 worker, 10 spec files: first-run-hint, first-run-hint-portrait, versus-layout, menu-phone-row, super-band, touch-fight-layout, phone-layout, hud-labels-sf, arcade-tag, tour-card): 75 of 75 passed.

## Overall

| Axis | r101 | r102 | r103 | r105 | Evidence |
| --- | --- | --- | --- | --- | --- |
| Fun | 3.4 | 3.4 | 3.4 | 3.4 | No combat change. Super cut-in and TAG! are the peaks (`super-desk-peak.png`); stages differ by backdrop and a hazard chip only. |
| Graphics | 3.8 | 3.8 | 3.8 | 3.8 | Four distinct floors; Rokcore and Sindarosa art are crisp, hit burst and the big damage number sell the impact (`fight-Earth-desk-c.png`). Portrait is still mostly sky. |
| Readability | 4.3 | 4.4 | 4.3 | 4.5 | Picker bar is back to one row with "Play online" on one line; super cut-in keeps the foe visible; portrait Strike buttons name the ability (`2v2-port-a.png`, `picker-port.png`). |

## By area

| Area | Result |
| --- | --- |
| Menu, Help (3 viewports) | Clean, five entries, no banned words. |
| Versus picker | Fixed since r103: at 390 the bar is Fight! / Back / "Play online" on one row (`picker-port.png`). |
| 1v1 stages | All four render; hazard chips readable ("FIRE x2", "WATER +HP", "AIR x2"). Water (teal) and Air (lavender) now separate better at desktop. |
| Super | Orange band plus title; foe stays visible on landscape (`super-land-peak.png`). Band clipped at the left edge in that frame, mid-animation (caveat: one frame only). |
| 2v2 and tag swap | Bench thumbnails and Tag slot work; desktop busy but readable; portrait HUD crowded. |
| Tour | Card, pick and fight all reach the arena; no errors. |
| Landscape 844x390 | Best layout; HUD life shows a bare number ("SINDAROSA 286"); Strike buttons say only "Strike 1 / 2". |
| Portrait 390x844 | Sky about 55-60% of the canvas, fighters small (about 90 px at DPR 2 in the shot); action bar two rows. |

## Not done

- Match-end win and lose cards (open since r101).
- Hero-by-hero Strike labels (only Sindarosa seen).
- Online with a real connection.
- First-run toast translucency judged from shots only; the e2e `first-run-hint*` and `touch-fight-layout` see-through checks pass.
