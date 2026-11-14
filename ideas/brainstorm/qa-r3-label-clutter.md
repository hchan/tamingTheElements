---
status: planned
added: 2026-11-13
---

# Action-bar TAG label overlaps slot text; prop labels read as debug; heroes stack

Severity: medium. The floating TAG label overlaps the "Tag 2s" text on slot 3 (water2-4tag-a.png). Props are labelled "P2 Spike" and "P2 Fire Bomb", which reads like debug text (water1-3mid.png). Heroes overlap in melee with no separation, and stale damage numbers hang away from fighters (earth1-1hit.png). The HUD shows empty "+ SAFE" / "x STUN" boxes under the names.

Fix: move the TAG cue, use player-facing prop names or icons only, add a soft push-apart, hide empty status boxes, expire damage numbers faster.

Done 2026-11-13: TAG caption lifted clear of slot text, damage numbers expire in 400 ms, ended status chips leave no empty outline. Still open: player-facing prop names (trap-fx.ts TRAP_WORDS/trapLabel), hero push-apart (sim).
