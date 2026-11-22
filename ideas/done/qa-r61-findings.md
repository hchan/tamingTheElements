---
status: done
triaged: a (fixed, dropped or art-only)
added: 2026-11-15
---

# QA r61 findings (HEAD 25c8c697)

Headless Chromium SwiftShader, dev server port 7982 (7981 was taken by another agent), screenshots under `~/claudetmp/qa-r61/s/`. Same script as r60 (Sindarosa vs Fiara, Cmd 16 for hits). No page errors. Roster24 heroes not reported.

## r60 findings: fixed or still open

- Picker at 667x375 shows no hero grid until scrolled: NOT fixed (`pl-picker.png`: Opponent, Team, Arena and the You/Computer cards fill the height; Fight bar plus "More below" cue present).
- Phone landscape menu: Echo's head now sits on the end of the title ("Elements"), `pl-menu.png`. NOT fixed, arguably slightly worse than r60 (Echo overlaps the title rather than touching it).
- Phone portrait black top half behind the rotate overlay: NOT fixed (`pp-hit.png`).
- FIRST BLOOD card over the arena bottom: NOT fixed (`fire-1v1-hit.png`, `earth-1v1-hit.png`, `2v2-tag-a.png`); on phone landscape the hint card sits upper-left over the arena and covers Sindarosa's head (`pl-hit.png`). My script never clicks Got it, so partly a script artefact, but a fresh player sees it the same way.
- WEATHER 0% box at the arena top centre: NOT fixed (every 1v1 shot); on a tag screen it collides with the TAG! call and the ADREN/EMBER chips (`2v2-tag-a.png`).
- Fiara sprite rough with triangle aura markers: NOT fixed (`fire-1v1-close.png`, `pl-hit.png`).
- Hit effect hides the victim and the 58/29 damage number covers the sprite: NOT fixed (`fire-1v1-hit.png`).

## New observations

- 2v2 TAG! call: the big "TAG!" text overlaps the benched hero card at the top and the WEATHER box, and the incoming hero is hard to identify mid-call (`2v2-tag-a.png`). Cluttered at the top centre.
- Water super: the HELLFIRE band is cut at the right edge mid-slide (expected) and the Fire banner colour is readable on blue (`water-1v1-super.png`).
- HoT/DoT (OT2-OT5): no visual signal captured. Status chips (SAFE, STUN, ADREN 3s, EMBER 5s) are readable but tiny and sit at the top edge; Cleanse is a new bar slot (`=`) with no hint what it cleanses. Worth a scripted Venom/burn rally next round.
- Tour stage card still clear; Wispera/Cyclonius opponent portraits are low-res on flat purple (`tour-stage.png`). Help page reads fine.
- Desktop menu and picker are clean: five entries, "More below" cue, big green Fight! (`menu-desk.png`, `picker-fire.png`).

## Process notes

- Playwright e2e was extremely slow (shared machine, load 9-13). Final: 82 passed, 1 failed (the known `touch-fight-layout.spec.ts:267`, unchanged since r60).
- Worktree has no node_modules; I symlinked the main checkout's (untracked, not committed).

## Coverage

Menu at 1280x720, 667x375, 390x844; Versus picker (1v1 per stage, 2v2, phone sizes); 1v1 on Fire, Water, Earth, Air (intro, close, hit, super, after-super); 2v2 with tag swap; Tour; Help; phone portrait and landscape fights.

## Triage 2026-11-21 (code-checked)

Fixed: picker at 667x375 (r62 confirmed), WEATHER box, first-hint card; Cleanse is explained in `src/ui/screens/help-guide.ts`; status chip size is covered by ideas/done/qa-r30-status-chip-duplication.md. Dropped by owner decision (2026-11-18, no phone/portrait/touch work): every phone, portrait, 667x375 and 812x375 item, plus the touch-fight-layout e2e specs (deleted).
Art-only, noted: Fiara sprite, Wispera portrait.
