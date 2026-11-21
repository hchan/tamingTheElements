---
status: idea
added: 2026-11-16
---

# Splash and montage art (menu, title, Help, hero select, team select, vs, win/loss)

Goal: a set of originals-style (Fiara/Treenoc look, not the scrapped grim redesigns) key-art stills and short montage sequences: title and menu backdrop, Help header art, hero-select splash per hero, win and loss splashes, and an SF/MvC-style team-select montage (team slots, hero reveal animation as each fighter is locked in, a vs/intro montage, and an end-of-match montage). Owner request 2026-11-16.

Why: the menu and select screens are the first thing players see and read bland (see [qa-menu-bland](../done/qa-menu-bland.md), [mvc-3v3-select-and-regen](mvc-3v3-select-and-regen.md), [tour-select-screen-redesign](tour-select-screen-redesign.md)).

- Size: L (art M, screen logic and sequencing M).
- Dependencies: roster24 art decisions ([roster24-art-redo](roster24-art-redo.md)) for the 12 new heroes; extends [menu-and-graphics-animation-everywhere](../in-progress/menu-and-graphics-animation-everywhere.md) (stills and layered motion).
- GPU-suitable: yes for the art stills (see [remote-gpu-offload](remote-gpu-offload.md)); the screen logic and montage timing are render-only (no sim change) and need no GPU.
- Owner-gated: yes for the art (show a contact sheet first, as with roster24); the layout and reveal logic are pre-approved.
- Player-facing text: Play, Versus, Online, Settings, Help only; never Classic, Arcade, ruleset or Capture (Snag).

## Progress note (2026-11-19)
Missing element variants (earth first) queued from .scratch/plans/splash-next-queue.json (11 prompts x 4 seeds, round 2 of 2).
