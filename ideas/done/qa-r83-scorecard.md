---
status: done
added: 2026-11-16
---

# QA r83: scorecard (vs Street Fighter / Marvel vs Capcom)

Build: main 44568d55 (Wispera Refined 2 portrait, portrait touch skirts, settled-layout and super-band e2e fixes).
Headless Chromium, SwiftShader, preview build on port 7992. Screenshots: `.scratch/r83/shots/` (gitignored, in this worktree).

| Area | r82 | r83 | Note |
|---|---|---|---|
| Fun | 3.5 | 3.5 | Unchanged. Super cinematic, tag swap and 2v2 read well on desktop; nothing new in feel. |
| Graphics | 3.5 | 3.5 | Four stage floors now look distinct. Wispera is a small dark vapour with a bright core: readable, but smaller than Rokcore/Pax. |
| Readability (desktop) | 4 | 4 | HUD, status chips and cut-in clear. Wispera's life figure (757) vs others (321 to 690) looks odd on the HUD. |
| Phone landscape | 4 | 4 | 667x375 and 844x390: strikes and Pause now sit in the right gutter, no overlap with the foe or HUD. |
| Phone portrait | 3.5 | 3.5 | Skirts fixed (all ten slots have one). The ~400 px empty band between bar and stick remains, and the arena is only ~250 px tall. |
| Menus / Help | 4.5 | 4.5 | Unchanged; Versus picker at 390 is a long scroll with "More below" hint. |
| Overall | 3.5 | 3.5 | Two r82 defects closed, one big portrait issue still open. |

E2E (pnpm e2e, 1 worker): portrait-play, super-band, phone-layout, touch-fight-layout, hero-portrait-shot: 62 of 62 passed across two runs.
One flake: hero-portrait-shot "World Tour: a portrait-rig team on the stage 1 fight" at 1280x720 timed out at 20 s on the first run (machine load 11 to 16 from other agents) and passed on rerun.
Not run: lint, typecheck, vitest, full e2e suite. Load was above 10 for most of the session, so timings are pessimistic.
