---
status: idea
added: 2026-11-16
---

# Unique special (super) move presentation art per hero

Goal: for all 24 heroes (12 originals + 12 roster24) a unique special/super presentation: animation art, effects, a cut-in portrait and a freeze-frame look, so each super is recognisable at a glance.

Why: supers currently share a generic presentation (see [qa-r3-super-cinematic-hides-action](qa-r3-super-cinematic-hides-action.md), [qa-r33-super-glow-subtle](qa-r33-super-glow-subtle.md)).

- Size: L.
- Dependencies: links to [sf-super-cinematics](sf-super-cinematics.md) (super and tag cinematics, the camera and timing layer) and [roster24-ability-icons-fx-weather-art](roster24-ability-icons-fx-weather-art.md) (ability art); final hero art ([roster24-art-redo](roster24-art-redo.md)). Render-only; any sim timing change needs a SIM_VERSION bump and one sim agent at a time.
- GPU-suitable: yes for stills and cut-in portraits; animation and effects are Phaser-side.
- Owner-gated: yes (art look; show a sheet first).
