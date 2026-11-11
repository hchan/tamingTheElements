# rig-assist

Offline helper that cuts a legacy sprite into rig parts for `tools/assets/bake-rig.ts` (ADR-0019, FUN-DESIGN 2.16). It is not part of
the game, the gate or CI, and nothing here is shipped. It adds no dependency to `package.json`.

## Setup (uv venv under `~/claudetmp/`)

```sh
uv venv ~/claudetmp/rig-assist-venv
# Fallback mode and selftest only:
uv pip install --python ~/claudetmp/rig-assist-venv/bin/python numpy pillow
# SAM 2 mode (downloads torch, about 1 GB): pinned versions
uv pip install --python ~/claudetmp/rig-assist-venv/bin/python -r tools/rig-assist/requirements.txt
```

SAM 2 also needs a checkpoint (for example `sam2.1_hiera_large.pt` from https://github.com/facebookresearch/sam2). Download it yourself
into `~/claudetmp/`; never commit it. The pins in `requirements.txt` are unverified on your machine: if pip cannot resolve them, bump
them together and update the file.

Check the install: `~/claudetmp/rig-assist-venv/bin/python tools/rig-assist/selftest.py`.

## Run

```sh
PY=~/claudetmp/rig-assist-venv/bin/python
$PY tools/rig-assist/cut.py public/assets/img/map/<name>.png points.json imgWorkArea/rigs/<name> \
  --crop 0,0,80,80 --checkpoint ~/claudetmp/sam2.1_hiera_large.pt          # SAM 2
$PY tools/rig-assist/cut.py ... --no-sam                                     # hand-drawn polygons
```

`--crop x,y,w,h` picks one frame out of a sheet (80x80 frames in `<name>.png`; `<name>Large.png` is 400x400, one image). `--underlap`
sets the extension in px (default 10, use 8 to 12). `--device mps` or `cuda` speeds up SAM; the image is upscaled 8x (`--upscale`)
because SAM does poorly on 80 px inputs.

## Authoring `points.json`

Coordinates are pixels of the cropped frame. Keys are part ids (letters, digits, `_`, `-`). Order matters: **the first part listed
wins overlaps and is drawn on top** (its default `z` is highest), so list front parts (arms, head) before the body.

```json
{
  "arm_r": { "parent": "body", "include": [[52, 40]], "exclude": [[40, 40]] },
  "head": { "parent": "body", "include": [[40, 14]] },
  "body": { "include": [[40, 44], [40, 56]], "exclude": [[40, 14]] },
  "tail": { "parent": "body", "polygon": [[10, 50], [20, 46], [22, 58], [8, 60]] }
}
```

- `include` / `exclude`: SAM 2 click points (at least one include). Exclude points on neighbours fix leaks.
- `polygon`: hand-drawn mask, used by `--no-sam` (and only then).
- `parent`: the part this one hangs from (omit for the one root). `z`: optional integer override.

## What it writes

`<out>/parts/<id>.png` and `<out>/rig.json`. Masks are made exactly disjoint (earlier wins, clipped to opaque pixels). Each part is
then grown `--underlap` px beneath the parts drawn above it, and the hidden pixels are filled by edge-extend (the nearest own pixel
colour, no diffusion, no model). The pivot is the centroid of where the part touches its parent (its own centroid for the root or a
part that does not touch); `at` is the offset from the parent pivot (the frame position for the root). `rig.json` gets `dirs: ["E"]`
and a placeholder `idle` action with empty curves: add curves, other directions and actions by hand.

## Review

1. Open every `parts/*.png` on a checkerboard at 800%: no stray pixels of neighbours, no holes, underlap looks like a plausible
   continuation of the part.
2. Move pivots by hand where the joint is not the contact centroid (shoulders, hips).
3. Add curves, then `pnpm assets:bake` and look at the frames; a part sliding off its parent means the pivot is wrong.
4. Copy `license.template.txt` to `<out>/license.txt` and fill it in truthfully. The bake and the sheet packer require provenance.
5. Warnings on stderr (`opaque px belong to no part`, `does not touch its parent`) mean a missing click or a wrong `parent`.
