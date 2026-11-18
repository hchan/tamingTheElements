---
status: epic
added: 2026-11-16
---

# Epic: Hero art and rigging

Released-hero sprites, rigs, bakes, portraits and per-hero animation quality (Fiara-style rigged and baked look).

- Suggested order: Audit and cleanup first (hero-art-audit, sprite cleanup, opaque-bbox tuck), then locomotion rows (backward walk, wings and knees), then expression poses, then portrait upgrades.
- Size: L overall; each member is S to M.
- Dependencies: Needs the rig and bake tools under tools/; share the palette work with rig-gen-shared-palette (art-and-presentation epic). Blender pilot lives in gpu-and-art-tooling.
- Owner-gated: Owner prefers the original Fiara and Treenoc art over grim redesigns (see grim-rebuilds-rejected); show any visible hero restyle to the owner as a sheet first.

Member ideas, in suggested priority order (work them as separate small work packages):

- [hero-art-audit-2026-11-15](../brainstorm/hero-art-audit-2026-11-15.md): Roster-24 hero art audit (12 unreleased heroes), 2026-11-15. Method: each public/assets/img/map/<id>Large.png (400x400;
- [sprite-cleanup-upscale-outline-pass](../brainstorm/sprite-cleanup-upscale-outline-pass.md): Sprite cleanup, upscale and outline consistency pass (all 24 heroes). Goal: one pipeline pass over all 24 hero sprites:
- [opaque-bbox-tuck](../brainstorm/opaque-bbox-tuck.md): Tuck on the opaque bounding box. wallTuck uses the frame box, not the opaque pixels, so transparent padding leaves a gap or clips art at the wall.
- [grim-rebuilds-rejected-fiara-treenoc-cyclonius](../brainstorm/grim-rebuilds-rejected-fiara-treenoc-cyclonius.md): Grim rebuilds of Fiara, Treenoc and Cyclonius were rejected. Owner, 2026-11-15: "Fiara and Treenoc: original is better than your new one", then Cyclonius too (its small 80x80 info-card and
- [qa-r7-hero-contrast-and-sprite-look](../brainstorm/qa-r7-hero-contrast-and-sprite-look.md): QA r7: dark heroes vanish on the air floor; sprite mismatch persists. Evidence: fight-air.png (Echo is a faint dark swirl on blue-grey while Pax reads strongly), hero-select.png, tour-stage1.png (blocky upscaled Wispera 
- [qa-r6-sprite-style-and-versus-defaults](../brainstorm/qa-r6-sprite-style-and-versus-defaults.md): QA r6: legacy vs rigged sprite mismatch; Versus default matchup. Evidence: hero-*.png, hero2/3-*.png, pick-*.png, tour-*.png (~/claudetmp/qa6/).
- [hero-sprite-grading](../in-progress/hero-sprite-grading.md) (in progress): Grim grade for hero sprites and HUD portraits. Owner feedback: the hero art reads bright and cartoony, with hard black outlines, next to the grim terrain and icons.
- [hero-rig-from-portraits](../in-progress/hero-rig-from-portraits.md) (in progress): Hero rigs from the painted portraits. Owner: the portraits look great, the in-game sprites "look soooo ugly" (thick outlines, flat fills, blurry upscale).
- [portraits-from-baked-sheets](../in-progress/portraits-from-baked-sheets.md) (in progress): Portraits and icons from the baked hero sheets. The HUD portrait, hero-select grid and panel, Versus pick tiles, garrison avatars and character details all read the legacy-layout strip
- [bigger-hero-sprites](../in-progress/bigger-hero-sprites.md) (in progress): Giant heroes (in progress). Owner feedback: heroes were about 60 px in a 1750 px arena and got lost.
- [elemental-heroes-grim](../in-progress/elemental-heroes-grim.md) (in progress): Ishimi, Morblass and Echo as grim elemental beings. Owner directive: not humanoid. Ishimi is a hunched mass of dripping murky slime with tendrils and many glowing eyes, Morblass a towering glacier beast
- [hero-elemental-being-pax-treenoc-fiara](../in-progress/hero-elemental-being-pax-treenoc-fiara.md) (in progress): Pax, Treenoc and Fiara as grim elemental beings. Redone via tools/assets/rig-gen/pax.py (dark granite boulder colossus, ember fissures, basalt shard ridge), treenoc.py (gnarled bark beast, root legs,
- [hero-elemental-being-sindarosa-rokcore](../in-progress/hero-elemental-being-sindarosa-rokcore.md) (in progress): Sindarosa and Rokcore as grim elemental beings. Redone via tools/assets/rig-gen/sindarosa.py and rokcore.py (charred horned flame beast, mossy rock golem with amber core), same part ids, sheet layou
- [grim-wispera-lavax](../in-progress/grim-wispera-lavax.md) (in progress): Grim Wispera and Lavax (non-humanoid). Owner: no person, limbs or clothes. Wispera (tools/assets/rig-gen/wispera.py) is a drifting cloud of pale mist, glowing motes, tattered vapour streame
- [backward-walk-animation](../in-progress/backward-walk-animation.md) (in progress): Backward-walk animation, per-elemental. Owner idea (2026-11-14): heroes need a real animation for walking backwards.
- [backward-walk-baked-rows](../brainstorm/backward-walk-baked-rows.md): Baked backward-walk rows (Phase 2 of backward-walk-animation). Phase 1 plays the existing walk row reversed plus a per-hero procedural gait.
- [move-animation-wings-knees](../brainstorm/move-animation-wings-knees.md): Movement animation: wing flaps and bent knees. Owner request (2026-11-14):
- [hero-expression-ko-victory-poses](../brainstorm/hero-expression-ko-victory-poses.md): Hero expression, KO and victory pose art. Goal: per-hero hurt, angry and smug expression variants for portraits, plus a KO pose and a victory pose for all 24 heroes, usable in the HUD, round-e
- [hi-res-mist-portraits](../brainstorm/hi-res-mist-portraits.md): Hi-res mist portraits. Wispera (and any other translucent haze hero) reads poorly in 80 px portrait strips:

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### HA-1 Sprite audit and cleanup

- Members: [hero-art-audit-2026-11-15](../brainstorm/hero-art-audit-2026-11-15.md), [sprite-cleanup-upscale-outline-pass](../brainstorm/sprite-cleanup-upscale-outline-pass.md), [opaque-bbox-tuck](../brainstorm/opaque-bbox-tuck.md), [hero-sprite-grading](../in-progress/hero-sprite-grading.md), [bigger-hero-sprites](../in-progress/bigger-hero-sprites.md)
- Size: L
- Shared files: asset manifest, public/assets/heroes/*, src/game/fx/hero-grade.ts
- Flags: PC-offloadable, needs browser/e2e (screenshots), owner sees a sheet first
- Parallel: Art lane: serial with every manifest bundle.

### HA-2 Portraits and sprite look (originals kept)

- Members: [grim-rebuilds-rejected-fiara-treenoc-cyclonius](../brainstorm/grim-rebuilds-rejected-fiara-treenoc-cyclonius.md), [qa-r7-hero-contrast-and-sprite-look](../brainstorm/qa-r7-hero-contrast-and-sprite-look.md), [qa-r6-sprite-style-and-versus-defaults](../brainstorm/qa-r6-sprite-style-and-versus-defaults.md), [portraits-from-baked-sheets](../in-progress/portraits-from-baked-sheets.md), [hi-res-mist-portraits](../brainstorm/hi-res-mist-portraits.md)
- Size: M
- Shared files: asset manifest, portrait assets, tools/assets/*
- Flags: PC-offloadable, owner art review, originals of Fiara and Treenoc must stay
- Parallel: Serial after HA-1 (manifest).

### HA-3 Rig and walk-cycle rows

- Members: [hero-rig-from-portraits](../in-progress/hero-rig-from-portraits.md), [backward-walk-animation](../in-progress/backward-walk-animation.md), [backward-walk-baked-rows](../brainstorm/backward-walk-baked-rows.md), [move-animation-wings-knees](../brainstorm/move-animation-wings-knees.md), [hero-expression-ko-victory-poses](../brainstorm/hero-expression-ko-victory-poses.md)
- Size: L
- Shared files: tools/rig-assist/*, pose-layer.ts, asset manifest
- Flags: PC-offloadable, needs browser/e2e, owner art review
- Parallel: Serial with AP-3, HA-1, HA-2 and any pose-layer.ts bundle (AE-2, GF-1).

### HA-4 Elemental being redesigns

- Members: [elemental-heroes-grim](../in-progress/elemental-heroes-grim.md), [hero-elemental-being-pax-treenoc-fiara](../in-progress/hero-elemental-being-pax-treenoc-fiara.md), [hero-elemental-being-sindarosa-rokcore](../in-progress/hero-elemental-being-sindarosa-rokcore.md), [grim-wispera-lavax](../in-progress/grim-wispera-lavax.md)
- Size: L
- Shared files: asset manifest, hero art
- Flags: OWNER-GATED: the owner preferred originals over grim redesigns; do not queue until the owner asks, then show a sheet first
- Parallel: Not queued.
