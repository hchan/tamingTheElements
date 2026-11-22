---
status: done
added: 2026-11-17
---

# QA r96 scorecard (main f0828a8a)

Scores 0-5 against Street Fighter / Marvel vs Capcom feel. Screenshots under `.scratch/shots/` (gitignored, QA worktree), named `m390-*` (390x844, isMobile, touch, 2x) and `m360-*` (360x640). Fight shots are `m<w>-fight-<Fire|Water|Air|Earth>.png` (after "Play anyway in portrait", 95 manual ticks) and `-b.png` (200 ticks later); `m<w>-help.png`, `m<w>-versus.png`, `m<w>-versus-opts.png`; live 1v1 `m390-live1-1..6.png`, live 2v2 `m390-live2-1..6.png`; idle manual run `m390-result-<n>.png`.
Driven headless (Chromium, SwiftShader), seed 7, preview build of `--mode test` on E2E port 7931. No console or page errors in any run.

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Portrait sky band, Fire (390, 360) | 3 | 3.5 | 4 | Stage-correct lava sky with volcano, crowd and torches. Hard seam at the arena top (y~545 at 390, y~200 at 360), crowd haze step (y~765 / y~400). |
| Portrait sky band, Water | 3 | 3.5 | 4 | Teal now correct. Same two seams. |
| Portrait sky band, Air | 3 | 3.5 | 4 | Violet now correct. Same two seams. |
| Portrait sky band, Earth | 3 | 3.5 | 4 | Olive now correct. Flat dark block above the haze is the most visible here and on Fire. |
| Dark band under floor when panned | - | 2.5 | 3 | Brown strip about y 1315-1365 at 390 between floor and action bar. |
| Help chip grid | - | 3.5 | 3.5 | Even two columns, but "Choosing your heroes" wraps and rows are uneven (61 vs 44 px). |
| Phone round-result card | - | - | - | Not captured: idle manual run was still mid-round at the last frame (timer 44). See findings "Not done". |
| Versus Options strip | 3 | 3.5 | 3.5 | Wraps to two lines, `aria-expanded` is null and does not change on tap, "More below" chip overlaps. |
| Live 1v1 (390) | 3.5 | 3.5 | 4 | HUD, status chips (STUN), hit counter and super bar readable; Strike taps work. |
| Live 2v2 (390) | 3 | 3 | 3 | Camera tight, two-row action bar covers floor, tiny HUD portraits and "NO TAG" labels. |

Overall: fun 3.3, graphics 3.4, readability 3.7. The stage-driven sky fix landed: all four stages now show their own palette, and the P1 from r95 is resolved. What remains is seams and polish, not wrong art.
