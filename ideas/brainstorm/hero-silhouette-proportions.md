---
status: idea
added: 2026-11-18
---

# Hero silhouette proportions (different lengths and widths)

Owner (2026-11-18): elementals, probably all, should have different lengths and widths, so heroes read apart by silhouette (tall and thin, low and wide, long serpent, round boulder), not only by colour.

Related, not the same: `ideas/in-progress/giant-heroes-size-for-speed.md` is UNIFORM scale (a size multiplier that trades speed for strength, a sim change). This idea is art-side aspect ratio.

- First example from the owner: the red dragon (Sindarosa, `sindarosaLarge.png`) should be LONGER (body and tail stretched along the facing axis), not the near-square pose it has now.
- Audit: bounding-box width/height of every released and roster24 Large sprite; list heroes with near-identical aspect (most sit near square in a 400x400 cell).
- Per-hero target proportion in the art brief (for example Cyclonius tall funnel, Curomo long serpent, Rokcore broad golem, Umbrel tall and narrow).
- Pipeline: ControlNet from a silhouette mask of the target proportion, so generation keeps the shape (see the Cyclonius discussion). Do not squash an existing sprite non-uniformly.
- Check hitbox and sim: art aspect must not change sim data; if hitbox should follow, that is a separate sim idea needing design approval.
- Check the pan camera, HUD portraits and hero select cells still frame non-square sprites.
- Never redesign a released hero without the side-by-side in chat first.
