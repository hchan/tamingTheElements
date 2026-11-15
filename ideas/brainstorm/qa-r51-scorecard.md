---
status: idea
added: 2026-11-15
---

# QA r51 scorecard (HEAD e64250ab, dev server port 7952, headless Chromium SwiftShader)

Scores 0-5 versus Street Fighter / Marvel vs Capcom (r50 was 3.5 / 4.0 / 3.5). Screenshots: `~/claudetmp/qa-r51/s/`. Port 7951 was held by a stale r50 dev server (older tree), so this round used 7952 for the dev server and 7953 for e2e.

- Fun: 3.5 (=). Every flow ran with 0 page errors: 1v1 on Fire, Water, Earth and Air, a super in each, a 2v2 tag swap (TAG! call, bench cards, "TAG 2.8s" cooldown), Tour stages 1 to 7, and a phone (667x375) match to "Victory! Rounds 2-0". CC chips (SNAGGED 2s, STUN, SAFE) still make status legible. Hit-stop feel cannot be judged from stills. The FIGHT! banner is still glued to the first hit.
- Graphics: 4.0 (=). Per-element floors, element-tinted super banners (PHOENIX RISE orange on Air and Water floors, SIREN GALE) hold. Hit marks still read the same pale cyan star on every target element in these shots, even though the `hit-mark-element` e2e passes. Idle auras are still faint. Wispera keeps its dithered pixel halo.
- Readability: 3.5 (=). Menu is clear on 1280x720, 844x390 and 390x844. The Versus 2v2 picker still hides the partner slot behind the Fight bar. Tour card and Help page are clear.

## Coverage

Menu (1280x720, 2560x1440, 844x390, 390x844, 667x375, reduced motion), Help, Settings, Online, Play picker, Versus 1v1 and 2v2 picker, 1v1 on four stages with hit and super, 2v2 tag, Tour stages 1 to 7 cards and fights, phone full match to Victory. Playwright e2e (1 worker, Chromium): app-flow, arena-smoke, cast-tint, first-run-hint, floor-backgrounds, hit-mark-element, 21 of 21 passed. Not covered: two-browser Online, Tour 8 and 9, real-time feel (hit-stop, menu entrance), firefox and webkit.

## Versus r50

No regressions, no visible improvements: all ten r50 open items persist in stills (see qa-r51-findings.md). Nothing in the HEAD diff since r50 (CA2 look model, unit-tested, no render hookup yet) was expected to change visuals.
