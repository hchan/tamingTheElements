# portrait-rig

Hero sprites built from the painted legacy portraits (`public/assets/img/map/<hero>Large.png`, 400x400, read only). The painting
is the art: `prep.py` turns it into one skinned `body` part plus additive glow parts and a contact shadow, and the bones move
feathered areas of that mesh. Nothing is redrawn and no poses are generated.

Pipeline (Python 3 with `requirements.txt`, then the repo's TypeScript tools):

```sh
python -m venv ~/claudetmp/venv-rig && ~/claudetmp/venv-rig/bin/pip install -r tools/assets/portrait-rig/requirements.txt
~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/prep.py [hero ...]        # imgWorkArea/rigs/<hero>/ + prep.lock.json
corepack pnpm assets:bake                                                               # imgWorkArea/sheets/<hero>/ (240 px frames, ss2)
corepack pnpm assets:sheets                                                             # public/assets/img/sheets/<hero>.png + manifest
~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/map-strips.py [hero ...]  # public/assets/img/map/<hero>.png (320x80)
~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/prep.py --check            # inputs unchanged since the last prep
```

- `spec/<hero>.json`: source portrait, frame and box, feet, matte clean-up, rim light, contact shadow, bones (head point, parent,
  feathered weight polygon in portrait px), glows (eyes, crystals, maw), the wave-deform mask and per-direction offsets.
- `spec/<hero>.anim.json`: the nine actions (idle, walk, cast, hurt, guard, dash, ko, victory, tagIn) as integer curves per
  bone or part, plus optional wave/noise deforms. Motion stays small and weighty; values are integers (see `tools/assets/bake-rig.ts`).
- `contact.py <hero> <out.png> [scale] [--dirs=E,SE] [actions...]`: a contact sheet of baked frames on a dark floor for review.
- `bright-check.py <hero> <out.png> [scale] [key:idx ...]`: baked frames over a bright (air-stage) and a dark backdrop, enlarged, to
  spot see-through holes and ragged mattes. Spec keys: `matte.alphaCut` drops faint detached wisps; `pits` repaints enclosed
  near-black pits inside `rects` as shaded hollows so they do not read as holes.
- `map-strips.py`: the 80 px map strips from the packed sheet (manifest rects; area downscale of the visual box). Never touches
  `*Large.png`. `tools/assets/rig-gen/pax-portrait.py` is a shim to it.

The lock lives next to the script (`prep.lock.json`), not in the rig dir, so the bake's own `bake.lock.json` stays the only lock
under `imgWorkArea/rigs/`. The old procedural generators in `tools/assets/rig-gen/` refuse to overwrite a rig whose `rig.json`
has `"source": "portrait"`. Design notes: [ADR-0020](../../../docs/adr/0020-portrait-rigs.md).
