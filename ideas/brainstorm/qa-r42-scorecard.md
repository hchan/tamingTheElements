---
status: idea
added: 2026-11-14
---

# QA r42 scorecard (main 228b4801, port 7942)

Scores 0-5 vs Street Fighter / MvC (r41 was 3.5 / 3.5 / 4).
- Fun: 3.5 (=). Tag swap and super remain the highlight; backward-walk and bob changes are not visible in stills, so no score move.
- Graphics: 3.5 (=). Remastered dark menu art is a clear upgrade (menu.png, help.png: moody, drag silhouettes, dragon/golem framing, logo ring readable); stages unchanged; Fiara still the weakest sprite.
- Readability: 4 (=). Phone 2v2 names now fit (+), but the phone 1v1 left name lost its element glyph and the first-run hint still covers play space (see qa-r42-findings.md).

Covered: menu, Help, hero picker, four stages (1v1), 2v2 tag swap, super, Tour pick and card, phone 667x375, 844x390, 390x844. Page errors: 0 in every run.
e2e (E2E_PORT=7943): touch-fight-layout, tour-card, first-run-hint, ghost-bar-shot, hit-juice-shot = 38 passed (3.9 min).
