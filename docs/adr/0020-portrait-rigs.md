# ADR-0020: Portrait rigs: big boxed frames, a smooth supersampled bake and skinned painted portraits

Status: accepted (pilot: Pax, Sindarosa, Curomo)

## Context

The owner liked the painted legacy portraits (`public/assets/img/map/<hero>Large.png`) but found the in-game sprites ugly:
they were procedural cutout rigs (ADR-0019) baked into 80 px frames with nearest-neighbour sampling, drawn at 2x or more
in the Arcade. The result had thick dark outlines, flat fills and blurry, blocky upscales. A painted portrait cut into
parts and rotated with nearest neighbour loses the painting, and a 2x upscale of an 80 px frame cannot look painted.

## Decision

- **Per-rig frame size and visual box.** A rig may set `frame` (the pilot heroes use 240 px), `res` (rig px per frame px) and
  `box` ([x, y, w, h], the part of the frame that maps onto the old 80 px visual box; the rest is overscan for wings, lunges and
  topples). `pnpm assets:sheets` packs these frames into their own atlas and writes the box into `sheets.generated.json`. At
  runtime `src/game/views/hero-scale.ts` (`setFrameBox`, `fitToBox`, `drawnBox`) maps the box, not the frame, onto the
  character's display rectangle, mirrored for W/SW/NW. Views that copy hero frames keep the box in the frame's custom data.
- **Smooth bake.** A rig with `"sample": "ss2"` is rendered by `tools/assets/bake-rig.ts` as meshes. Each vertex goes through
  the bones, deformers and part tree into a 2x supersampled premultiplied buffer. Triangles are rasterised with integer edge
  functions and sample the part bilinearly. The buffer is box-filtered into the frame, and colour bleeds into the clear
  border. It is still integer-only and deterministic (ADR-0019's lock and `--check` are unchanged), so the same inputs give the
  same bytes on every machine.
- **Bone-weight skinning.** An ss2 part may carry a `skin`: a vertex grid with up to 3 Q8 bone weights per vertex, summing to
  256. One painted image can then bend (head nod, wing beat, tail sway) without being cut apart. Additive parts (`blend:
  "add"`) carry glows.
- **Portrait rigs.** `tools/assets/portrait-rig/prep.py` builds the rig from the portrait itself. One skinned `body` part holds
  every pixel of the painting, and its bones and feathered weight polygons come from `spec/<hero>.json` (animations in
  `spec/<hero>.anim.json`). Prep cleans the matte: it drops specks and decontaminates the edge band so there is no white fringe
  and no hard outline. It adds a coloured rim light on one side (it only adds light, never darkens), bleeds colour into the
  margin, and paints additive glows (a hot core, an uneven halo and a wide bloom) plus a soft tapered contact shadow.
  `prep.lock.json` pins every input and output, and `prep.py --check` fails on a stale rig. `tools/assets/rig-gen` refuses to
  overwrite a rig marked `"source": "portrait"`.
- **No grade on painted art.** `PAINTED_HEROES` in `src/game/fx/hero-grade.ts` skips the load-time hero grade for the
  pilot heroes (sheet, map strip and HUD picture). The grade's outline lift and desaturation would flatten the painting;
  the owner asked for mystic, bright art in the portraits' own colour.
- **Motion** is subtle and weighty: small rotations and offsets on the skin bones, no bouncy squash.

## Consequences

- The pilot heroes keep the painted portrait's texture, lighting and colour in play. Their sheets are much bigger (a
  3840x2400 atlas each) and the size budgets were raised; the owner considers size irrelevant.
- QA is automated in `tests/repo/portrait-rig.test.ts`:
  - every frame exists, with no clipping and steady feet;
  - an edge-halo metric: soft edge pixels whose luma lies outside the colours of the body next to them;
  - E faces east;
  - painted detail is kept (Laplacian variance at least 0.6x the portrait's at the same size).
- `tests/e2e/hero-portrait-shot.spec.ts` checks in real fights (Arcade pairs at 1280x720 and 1920x1080@2, plus a World Tour
  stage) that the sheets are drawn ungraded, frame names resolve and the body height is steady. With `SHOT_DIR` set it
  saves screenshots, which `tools/assets/portrait-rig/compare-shots.py` puts beside the portraits.
- Limits:
  - A portrait has one painted view. The other directions are the same painting with per-direction offsets and mirroring,
    so N and NE do not show a true back view.
  - At 1920x1080 on a 2x display the 240 px frame is still upscaled about 2.4x and reads slightly soft.
- Python prep needs numpy and Pillow (`tools/assets/portrait-rig/requirements.txt`). The TypeScript bake stays
  dependency-free.
- Other heroes keep the procedural rigs and the grade until they get a portrait rig.
