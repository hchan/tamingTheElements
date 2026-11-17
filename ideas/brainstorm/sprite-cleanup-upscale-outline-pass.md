---
status: idea
added: 2026-11-16
---

# Sprite cleanup, upscale and outline consistency pass (all 24 heroes)

Goal: one pipeline pass over all 24 hero sprites: clean fringes and stray pixels, upscale where small, and unify outline weight and colour so the 12 originals and 12 roster24 heroes read as one set.

Why: mixed outline styles and sizes are the most visible inconsistency (see [hero-art-audit-2026-11-15](hero-art-audit-2026-11-15.md), [bigger-hero-sprites](../in-progress/bigger-hero-sprites.md), [hero-sprite-grading](../in-progress/hero-sprite-grading.md)).

- Size: M.
- Dependencies: roster24 art finalised first; no sim change, but baked sheets and the asset manifest change (one agent at a time on the manifest).
- GPU-suitable: yes for upscaling; cleanup and outline unification are CPU scripts in tools/.
- Owner-gated: yes (changes the look of released heroes; compare before and after sheets).
