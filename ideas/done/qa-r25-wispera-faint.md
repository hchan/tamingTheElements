---
status: done
added: 2026-11-14
---

# Wispera is a faint blue smear on the air stage

Wispera is a translucent cyan blob on the pale blue air arena. Against Pax she is barely readable at 1280x720: the fighter you control has the lowest contrast on screen, and the dark shadow under her reads as a stain.

Repro: `/?seed=7&hero=wispera&foe=pax`, wait for the arena, place both fighters at x 480 and 620, hold Enter. Screenshot at 1280x720.

Idea: add a darker rim or outline pass, a stronger core, or a darker air-stage floor tint behind her. Keep the ghostly feel but guarantee a minimum contrast against the stage.

## Done

Wispera: ink edge two pixels deep and semi-transparent body regains 55 percent of missing opacity (hero-grade.ts ghost mode).
