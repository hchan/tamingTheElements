---
status: done
triaged: a (carried to later rounds; all fixed, dropped or art-only)
added: 2026-11-15
---

# QA r51 findings (ranked)

HEAD e64250ab, dev server, headless Chromium SwiftShader, 0 page errors in every script. Screenshots under `~/claudetmp/qa-r51/s/`. Scores in qa-r51-scorecard.md. Compared with qa-r50-findings.md: nothing fixed, nothing regressed.

## Open (ranked, r50 number in brackets)

1. [r50 #1] FIGHT! banner still overlaps the first hit: damage "2" glued to "FIGHT!" (`st-Earth-hit.png`), and FIGHT! drawn over the burst and Fiara (`st-Fire-hit.png`). Open since r47. Hide on first input or after about 0.6 s. Caveat: shots use manual stepping, so real-time fade may differ, but a hit within the banner window is common in play.
2. [#2] Hit marks look alike across target elements: pale cyan star with ring on Fire, Earth and Air targets (`st-Fire-hit.png`, `st-Earth-hit.png`, `ph-super.png`). `hit-mark-element` e2e passes, so either the test checks only presence or the tint is too weak at this size. Tint by attacker element.
3. [#3] Idle auras barely show: faint glow under Wispera and none visible on Fiara (`st-Water-start.png`).
4. [#4] 2v2 Versus picker: sticky Fight bar covers the partner slot (Echo hidden) and the detail pane shows Sindarosa with "Add to team" though the team is full (`team2-picker-set.png`). The "More heroes below" pill is there but the slot stays covered.
5. [#5] First-run hint ("FIRST BLOOD ... Got it") sits over the arena bottom in 2v2 (`team2-tag-b.png`) and upper left on phone (`ph-super.png`). The e2e says it fades on its own, but the manual-step shots keep it; confirm it also fades in real time with no input.
6. [#6] "ROUND" ghost text behind the damage number during the TAG! call (`team2-tag-b.png`).
7. [#7] Wispera dithered pixel halo (`st-Water-start.png`, `st-Fire-hit.png`); menu hero cut-outs have contour noise (`menu-desk-late.png`).
8. [#8] Phone landscape 844x390 menu is clean now: golem top right, no collision with title (`menu-ph-l.png`). Effectively fixed.
9. [#9] Tour card art mixes painted and blurry sprite portraits on a flat purple tile (`tour-card5.png`); Wispera and Echo tiles are the weakest.
10. [#10] 2v2 life asymmetry (Echo 438 vs Morblass 375) is not shown per hero in the picker.

New minor:

11. Help page: the elemental orb sits mid-page over the hero art between the jump chips and the second chip row, so the page reads cluttered at 1280x720 (`page-help.png`).
12. Super banner text is semi-transparent for several ticks (`st-Water-super.png`); at 14 ticks after cast the name is half faded, so it is easy to miss. Consider holding full opacity longer.

## Fixed or improved since r50

- Item 8 (phone landscape title collision) is fixed.
- Nothing else changed visibly.

## Working well

Menu on three viewports, per-element stage floors, element-labelled super banner, TAG! call with bench cards and cooldown, CC chips, Tour ladder to stage 7, phone match to Victory 2-0, Help and Settings pages. E2E subset (6 specs, 21 tests, 1 worker) all green.

## Not verified

Online two-browser flow, hit-stop and menu entrance feel, Tour 8 and 9, Firefox and WebKit. Port 7951 was occupied by a stale r50 dev server (pid 50471, cwd agent-a690ae345ac49639d); a coordinator may want to kill it.

## Triage 2026-11-21 (code-checked)

Same set as r50, all checked against code: hit marks per element (`hit-mark.ts`), idle auras, first-run hint events (`first-run-hint.ts`), picker partner slot and Add-to-team relabel (`arcade-versus.ts:473`), super banner full opacity (r52 #12 fixed). Help orb fixed in r52. Art-only, noted: Wispera halo, menu cut-out contour noise, Tour card portrait mix. The stale dev server note (pid 50471) is obsolete.
