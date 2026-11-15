---
status: idea
added: 2026-11-14
---

# QA r43 scorecard (HEAD 9e0224d0, dev server, port 7944)

Scores 0-5 vs Street Fighter / MvC (r42 was 3.5 / 3.5 / 4).
- Fun: 3.5 (=). Tag swap and super remain the highlight; no gameplay change visible in stills since r42 (this round's commits are idea files only).
- Graphics: 3.5 (=). Menu art, stages and the super burst hold up; Fiara is still the weakest sprite.
- Readability: 3.5 (-0.5 vs r42 is a stricter read, not a regression: all four r42 readability issues persist unchanged, see qa-r43-findings.md).

Covered: menu (5 entries), Help, 1v1 on four stages, 2v2 tag swap and super, Tour pick/card/fight, phone 667x375 (1v1, 2v2, menu, help, Tour), portrait 390x844. Page errors: 0 in every run. e2e not re-run (no code changed since r42).
